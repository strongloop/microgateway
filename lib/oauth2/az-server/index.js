// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var uid = require('uid2');
var _ = require('lodash');
var async = require('async');
var crypto = require('crypto');
var session = require("express-session");
var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:az-server'});

var models = require('../models');
var helpers = require('../oauth2-helper');
var oauth2Provider = require('./oauth2orize');
var basic = require('./id-extract/basic');

var validateClient = helpers.validateClient;
var clientInfo = helpers.clientInfo;
var userInfo = helpers.userInfo;

var SESSION_KEY = 'authorize';
var OAUTH_STATE_AUTHENTICATION = 'Authentication';
var OAUTH_STATE_AUTHORIZATION = 'Authorization';
var OAUTH_STATE_INITIAL = 'Init';
var sessionMiddleware;

/*
 * config should contains:
 * - app : the express application
 */
module.exports = function(config) {

  //we decide to use JWT as the token format
  config = config || {};
  var generateToken = config.generateToken || generateJTWToken;
  var oauthModels = models.getInstance(config.datasourceDef);
  var sessionSecret = config.sessionSecret || crypto.randomBytes(64).toString('hex');
  var serverPool = new ServerPool({
        models: oauthModels.models,
        sessionSecret: sessionSecret,
        generateToken: generateToken
      });
  
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
      next();
      return;
    }

    //when go to this spot, it should be an oauth releated requests
    var parameters = req.ctx.request.parameters;
    if (_.isString(parameters['response_type']) && 
        _.isString(parameters['client_id']) &&
        _.isString(parameters['scope'])) {

      //handle AZ requests here
      var server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.azHandlers, req, res, function(error) {
        next(error);
      });
    } else {
      next();
    }
  };
};

/**
 * A Server Pool instance to maintain AZ servers
 * It use apid.id and snapshot-id as the key
 * to lookup the corresponding server
 */
function ServerPool(options) {
  this.pool = {};
  options = options || {};
  this.models = options.models;
  this.sessionSecret = options.sessionSecret ||
      crypto.randomBytes(64).toString('hex');
  this.generateToken = options.generateToken || generateJTWToken;
  //all of the servers use the same one session middleware
  this.sessionMiddleware = session(
      {resave: true,
        saveUninitialized: true,
        secret: this.sessionSecret,
        cookie: { maxAge: 600000 }
      });
}

function getTokenHandler(params, done) {
  return function(err, accessToken) {
    if (err || !accessToken) {
      return done(err);
    }
    done(null, accessToken.id, helpers.buildTokenParams(accessToken, params));
  };
}

ServerPool.prototype.getServer = function (apiid, apidoc, snapid) {

  var key = snapid + ':' + apiid;
  var server = this.pool[key];
  var _this = this;

  if (_.isUndefined(server)) {
    // create OAuth 2.0 server
    logger.debug('creating oauth server for', apidoc.info.title);
    server = oauth2Provider.createServer();
    var oauth2Cfg = apidoc['x-ibm-configuration'].oauth2;
    var supportedScopes = oauth2Cfg.scopes;
    var allowedGrants = oauth2Cfg.grants;
    var idExtract = oauth2Cfg['identity-extraction'];
    var authorizationType = oauth2Cfg.authorization;

    server.scope(Object.getOwnPropertyNames(supportedScopes));
    server.grantType(allowedGrants);

    if (allowedGrants.indexOf('accessCode') !== -1) {
      server.grant(oauth2Provider.grant.code(
        { allowsPost: false},
        function(client, redirectURI, user, scope, ares, done) {

          //currently, only redirectURI is available.
          if (validateClient(client, server,
              {
                scope: scope,
                grantType: 'accessCode'
              }, done)) {
            return;
          }

          var generateAuthCode = function() {
            var code = _this.generateToken({
              grant: 'Authorization Code',
              client: client,
              user: user,
              scope: scope,
              redirectURI: redirectURI
            }).id;

            logger.debug('Generating authorization code: %s %s %s %s %s',
                code, clientInfo(client), redirectURI, userInfo(user), scope);
            _this.models.authorizationCodes.save(code, client.id, redirectURI,
              user.id,
              scope,
              function(err) {
                done(err, err ? null : code);
              });
          };

          if (ares.authorized) {
            generateAuthCode();
          } else {
            _this.models.permissions.addPermission(client.id, user.id, scope,
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

        _this.models.authorizationCodes.findByCode(code, function(err, authCode) {
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

          var token = _this.generateToken({
            grant: 'Authorization Code',
            client: client,
            scope: authCode.scopes,
            code: authCode,
            redirectURI: redirectURI
          });

          var refreshToken = _this.generateToken({
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
          _this.models.authorizationCodes.delete(code, function(err) {

            if (err) return done(err);
            _this.models.accessTokens.save(token.id, clientId,
              resourceOwner, authCode.scopes, refreshToken,
              getTokenHandler(token, done));
          });
        });
      }));
    }

    if (allowedGrants.indexOf('implicit') !== -1) {
      server.grant(oauth2Provider.grant.token(
        { allowsPost: false},
        function(client, user, scope, ares, done) {

          if (validateClient(client, server,
              {
                scope: scope,
                grantType: 'implicit'
              }, done)) {
            return;
          }

          function generateAccessToken() {
            var token = _this.generateToken({
              grant: 'Implicit',
              client: client,
              user: user,
              scope: scope
            });
            logger.debug('Generating access token: %j %s %s %s',
              token, clientInfo(client), userInfo(user), scope);

            _this.models.accessTokens.save(token.id, client.id, user.id, scope, null,
              getTokenHandler(token, done));
          }

          if (ares.authorized) {
            generateAccessToken();
          } else {
            _this.models.permissions.addPermission(client.id, user.id, scope,
              function(err) {
                if (err) {
                  return done(err);
                }
                generateAccessToken();
              });
          }
        }));
    }
    
    var azHandlers = [
      this.sessionMiddleware, //session
      server.authorization( {sessionKey: SESSION_KEY}, //authorization
        function (ctx, clientId, redirectURI, scope, responseType, done) {
          authorizationValidate.call(server, _this.models, ctx, 
              clientId, redirectURI, scope, responseType, done);
        }
      )
    ];

    //basic auth middleware
    if (idExtract.type === 'basic') {
      azHandlers.push(
        basic({apidoc: apidoc, sessionKey: SESSION_KEY}));
    }

    if (authorizationType.type === 'authenticated' && 
        idExtract.type === 'basic') {
      //when using basic auth and authorization === 'authenticated'
      //directly call server._respond
      azHandlers.push(function (req, res, next) {
        req.oauth2.res = {allow: true};
        server._respond(req.oauth2, req.ctx, function(err) {
          if (err) { return next(err); }
          return next(new AuthorizationError('Unsupported response type: ' + req.oauth2.req.type, 'unsupported_response_type'));
        });
      });
    } else {
      azHandlers.push(
          // Check if the user has granted permissions to the client app
          function(req, res, next) {
            var userId = req.oauth2.user.id;
            var clientId = req.oauth2.client.id;
            var scope = req.oauth2.req.scope;
            models.permissions.isAuthorized(clientId, userId, scope,
              function(err, authorized) {
                if (err) {
                  return next(err);
                } else if (authorized) {
                  req.oauth2.res = {};
                  req.oauth2.res.allow = true;
                  server._respond(req.oauth2, req.ctx, function(err) {
                    if (err) {
                      return next(err);
                    }
                    return next(new AuthorizationError('Unsupported response type: '
                      + req.oauth2.req.type, 'unsupported_response_type'));
                  });
                } else {
                  next();
                }
              });
          },
          // Now try to render the dialog to approve client app's request for permissions
          function(req, res, next) {
//            res.render(options.decisionView || 'dialog',
//              { transactionId: req.oauth2.transactionID,
//                user: req.user, client: req.oauth2.client,
//                scopes: req.oauth2.req.scope,
//                redirectURI: req.oauth2.redirectURI});
            //TODO:based on the 'authorization' settings to handle
            //the concent page
            next();
          }
      );
    }

    server.azHandlers = azHandlers;
    this.pool[key] = server;
  }
  return server;
};

/**
 * cleanup the server pool for a specific snapshot id
 * or clean up all
 */
ServerPool.prototype.cleanUp = function (snapid) {
  if (_.isUndefined(snapid)) {
    this.pool = {};
  } else {
    var keys = Object.getOwnPropertyNames(this.pool);
    for(var i = 0, len = keys.length; i < len; i++) {
      var key = keys[i];
      if (key.indexOf(snapid) === 0) {
        delete this.pool[key];
      }
    }
  }
};

function authorizationValidate(models, ctx, clientId, redirectURI, scope, responseType, done) {
  logger.debug('Verifying client %s redirect-uri: %s scope: %s response-type: %s',
    clientId, redirectURI, scope, responseType);

  //this is bound to server
  var server = this;

  models.clients.find(ctx['config-snapshot-id'],
      ctx._.api['subscription-id'],
      clientId,
      function(err, client) {
        if (err || !client) {
          return done(err);
        }
        logger.debug('Client found: %s', clientInfo(client));
        //we only have redirectURI in application info
        //also verify the responseType with server settings
        if (validateClient(client, server,
            {
              responseType: responseType,
              redirectURI: redirectURI
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
  var secret = options.client['app-credentials'][0]['client-secret'];
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
  var models = models.getInstance();
  
  //clientId, token, userId, scopes
  models.createToken('clientA', 'token1', 'userid1', ['scope1']);
  models.createToken('clientB', 'token2', 'userid2', ['scope2']);
  models.createToken('clientB', 'token3', 'userid2', ['scope1']);
  
  models.getTokenByClientId('clientA', function (error, tokenObj) {
    console.error('token record:', tokenObj);
  });
}
