// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var models = require('../models');
var helpers = require('../oauth2-helper');
var uid = require('uid2');
var _ = require('lodash');
var oauth2Provider = require('./oauth2orize');
var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:az-server'});
var dsc = require('../../../datastore/client');
var basic = require('./id-extract/basic');
var async = require('async');

var validateClient = helpers.validateClient;
var clientInfo = helpers.clientInfo;


var SESSION_KEY = 'authorize';
var OAUTH_STATE_AUTHENTICATION = 'Authentication';
var OAUTH_STATE_AUTHORIZATION = 'Authorization';
var OAUTH_STATE_INITIAL = 'Init';
/*
 * config should contains:
 * - app : the express application
 */
module.exports = function(config) {

  //we decide to use JWT as the token format
  var generateToken = config.generateToken || generateJTWToken;
  var oauthModels = new models.OAuthModels();
  

  return function(req, res, next) {
    //lets see if the request is an oauth2 authorization request
    var swagger;
    if (!req.ctx || !req.ctx.api || !req.ctx.api.document) {
      next();
      return;
    }

    swagger = req.ctx.api.document;

    //is it a OAuth2.0 Provider API
    if (!swagger['x-ibm-configuration'] || !swagger['x-ibm-configuration'].type
        ||swagger['x-ibm-configuration'].type !== 'oauth') {
      return;
    }

    //when go to this spot, it should be an oauth releated requests
    var parameters = req.ctx.request.parameters;
    if (_.isString(parameters['response_type']) && 
        _.isString(parameters['client_id']) &&
        _.isString(parameters['scope'])) {

      //need session support
      if (_.isUndefined(req.session)) {
        next({name: 'Oauth2Error', message: 'need session support'});
        return;
      }

      var server = getOAuthServer(oauthModels.models, swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.handlers, req, res, function(error) {
        console.error('after applyEachSeries', error);
        next(error);
      });
    }
  };
};

function getOAuthServer(models, apidoc, snapid) {
  // create OAuth 2.0 server
  //TODO: add caching
  logger.debug('getting/creating oauth server according apidoc and', snapid);
  var server = oauth2Provider.createServer();
  var supportedScopes = apidoc['x-ibm-configuration'].oauth2.scopes;
  var allowedGrants = apidoc['x-ibm-configuration'].oauth2.grants;
  var idExtract = apidoc['x-ibm-configuration'].oauth2['identity-extraction'];

  if (allowedGrants.indexOf('accessCode') !== -1) {
    server.grant(oauth2Provider.grant.code(
      { allowsPost: false},
      function(client, redirectURI, user, scope, ares, done) {

        //currently, only redirectURI is available.
        if (validateClient(client, {redirectURI: [redirectURI]}, done)) {
          return;
        }

        var generateAuthCode = function() {
          var code = generateToken({
            grant: 'Authorization Code',
            client: client,
            user: user,
            scope: scope,
            redirectURI: redirectURI
          }).id;

          logger.debug('Generating authorization code: %s %s %s %s %s',
            code, clientInfo(client), redirectURI, userInfo(user), scope);
          models.authorizationCodes.save(code, client.id, redirectURI,
            user.id,
            scope,
            function(err) {
              done(err, err ? null : code);
            });
        };

        if (ares.authorized) {
          generateAuthCode();
        } else {
          models.permissions.addPermission(client.id, user.id, scope,
            function(err) {
              if (err) {
                return done(err);
              }
              generateAuthCode();
            });
        }
      }));

    /*
     Exchange authorization codes for access tokens.  The callback accepts the
     `client`, which is exchanging `code` and any `redirectURI` from the
     authorization request for verification.  If these values are validated, the
     application issues an access token on behalf of the user who authorized the
     code.
     */
    server.exchange(oauth2Provider.exchange.code(
      function(client, code, redirectURI, done) {
        logger.debug('Verifying authorization code: %s %s %s',
          code, clientInfo(client), redirectURI);

        models.authorizationCodes.findByCode(code, function(err, authCode) {
          if (err || !authCode) {
            return done(err);
          }

          logger.debug('Authorization code found: %j', authCode);

          var clientId = authCode.appId || authCode.clientId;
          var resourceOwner = authCode.userId || authCode.resourceOwner;

          // The client id can be a number instead of string
          if (client.id != clientId) {
            return done(new TokenError('Client id mismatches',
              'invalid_grant'));
          }
          if (redirectURI != authCode.redirectURI) {
            return done(new TokenError('Redirect uri mismatches',
              'invalid_grant'));
          }

          if (isExpired(authCode)) {
            return done(new TokenError('Authorization code is expired',
              'invalid_grant'));
          }

          var token = generateToken({
            grant: 'Authorization Code',
            client: client,
            scope: authCode.scopes,
            code: authCode,
            redirectURI: redirectURI
          });

          var refreshToken = generateToken({
            grant: 'Authorization Code',
            client: client,
            code: authCode,
            scope: authCode.scopes,
            redirectURI: redirectURI,
            refreshToken: true
          }).id;

          logger.debug('Generating access token: %j %s %s',
            token, clientInfo(client), redirectURI);

          // Remove the authorization code
          models.authorizationCodes.delete(code, function(err) {

            if (err) return done(err);
            models.accessTokens.save(token.id, clientId,
              resourceOwner, authCode.scopes, refreshToken,
              getTokenHandler(token, done));
          });
        });
      }));
  }

  //need to decide the login uri by the settings in the apidoc

  var handlers = [server.authorization( {sessionKey: SESSION_KEY},
      function (ctx, clientID, redirectURI, scope, responseType, done) {
        authorizationValidate.call(server, models, ctx, 
            clientID, redirectURI, scope, responseType, done);
      }
    )
  ];

  //basic auth middleware
  if (idExtract.type === 'basic') {
    handlers.push(basic({apidoc: apidoc}));
  }

  server.handlers = handlers;
  return server;
}

function authorizationValidate(models, ctx, clientID, redirectURI, scope, responseType, done) {
  logger.debug('Verifying client %s redirect-uri: %s scope: %s response-type: %s',
    clientID, redirectURI, scope, responseType);

  dsc.getAppInfo(ctx['config-snapshot-id'],
      ctx._.api['subscription-id'],
      clientID,
      function(err, client) {
        if (err || !client) {
          return done(err);
        }
        logger.debug('Client found: %s', clientInfo(client));
        if (validateClient(client, {
          scope: scope,
          redirectURI: redirectURI,
          responseType: responseType
        }, done)) {
          return;
        }
        return done(null, client, redirectURI);
      }
  );
}

function generateJTWToken(options) {
  options = options || {};
  var id = uid(32);
  var secret = options.client.clientSecret;
  var payload = {
    id: id,
    clientId: options.client.id,
    userId: options.user && options.user.id,
    scope: options.scope,
    createdAt: new Date()
  };

  var token = helpers.generateJWT(payload, secret, 'HS256');
  return {
    id: token
  };
};

if (require.main === module) {
  var models = new models.OAuthModels();
  
  //clientId, token, userId, scopes
  models.createToken('clientA', 'token1', 'userid1', ['scope1']);
  models.createToken('clientB', 'token2', 'userid2', ['scope2']);
  models.createToken('clientB', 'token3', 'userid2', ['scope1']);
  
  models.getTokenByClientId('clientA', function (error, tokenObj) {
    console.error('token record:', tokenObj);
  });
}