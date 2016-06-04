// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var uid = require('uid-safe').sync;
var _ = require('lodash');
var async = require('async');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var session = require('express-session');
var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:az-server'});

var models = require('../models');
var helpers = require('../oauth2-helper');
var oauth2Provider = require('./oauth2orize');
var idExtractor = require('./middleware/id-extractor');
var defaultLoginForm = require('./middleware/default-login-form');
var defaultConsentForm = require('./middleware/default-consent-form');
var transactionLoader = require('./middleware/transactionLoader');
var AuthorizationError = require('../errors/authorizationerror');
var TokenError = require('../errors/tokenerror');

var validateClient = helpers.validateClient;
var clientInfo = helpers.clientInfo;
var userInfo = helpers.userInfo;

var SESSION_KEY = 'authorize';
var sessionMiddleware;
var defaultLoginFormRender;

/*
 * config should contains:
 * - app : the express application
 */
module.exports = function(config) {

  //we decide to use JWT as the token format
  config = config || {};
  var generateToken = config.generateToken || generateJWTToken;
  var oauthModels = models.getInstance(config.datasourceDef);
  var sessionSecret = config.sessionSecret || crypto.randomBytes(64).toString('hex');
  var serverPool = new ServerPool({
        models: oauthModels.models,
        sessionSecret: sessionSecret,
        generateToken: generateToken
      });

  //load default login page content here
  defaultLoginFormRender = defaultLoginForm();

  return function(req, res, next) {
    //lets see if the request is an oauth2 request
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


    //purge the expired code/permission/token before processing
    serverPool.models.accessTokens.purge();
    serverPool.models.permissions.purge();
    serverPool.models.authorizationCodes.purge();

    //when go to this spot, it should be an oauth releated requests
    var parameters = req.ctx.request.parameters;
    if (_.isString(parameters['response_type']) &&
        _.isString(parameters['client_id']) &&
        _.isString(parameters['scope'])) {

      //handle first AZ requests here
      logger.debug('Receiving an OAuth2 AZ request.');
      var server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

        async.applyEachSeries(server.azHandlers, req, res, function(error) {
          if (error === 'route') { return next();}
          next(error);
        });
    } else if (req.ctx.request.verb === 'POST' && 
        _.isString(req.ctx.request.body['transaction_id'])) {

      //handle login form
      var server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.loginHandlers, req, res, function(error) {
        if (error === 'route') { return next();}
        next(error);
      });
    } else if (req.ctx.request.verb === 'POST' && 
        _.isString(req.ctx.request.body['dp-state'])) {

      //handle consent form
      var server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);      
      next({name: 'OAuth2Error', message: 'Not implement yet'});
      
    } else if (_.isString(parameters['grant_type'])) {
      //handle the token request
      logger.debug('Receiving an OAuth2 token request.');
      var server = serverPool.getServer(
          req.ctx._.api.id,
          swagger,
          req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.tokenHandlers, req, res, function(error) {
        next(error);
      });
    } else {
      logger.error('Received a unrecognized OAuth2 request.');

      next({ name: 'OAuth2Error',
             message: 'Received an OAuth2 request with invalid parameters'});
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
  this.generateToken = options.generateToken || generateJWTToken;
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

    var tokenTTL = oauth2Cfg['access-token'] && oauth2Cfg['access-token'].ttl;
    var enableRefreshToken = !!oauth2Cfg['refresh-token'];
    var refreshTTL =  enableRefreshToken && oauth2Cfg['refresh-token'].ttl;

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
            _this.models.authorizationCodes.save(code, client['client-id'], redirectURI,
              user.id,
              scope,
              function(err) {
                done(err, err ? null : code);
              });
          };

          if (ares.authorized) {
            generateAuthCode();
          } else {
            _this.models.permissions.addPermission(client['client-id'], user.id, scope,
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
          if (client['client-id'] != clientId) {
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

          var refreshToken;
          if (enableRefreshToken) {
            refreshToken = _this.generateToken({
              grant: 'Authorization Code',
              client: client,
              code: authCode,
              scope: authCode.scopes,
              redirectURI: redirectURI,
              refreshToken: true
            }).id;
          }

          logger.debug('Generating access token: %j %s %s',
            token, clientInfo(client), redirectURI);

          // Remove the authorization code
          _this.models.authorizationCodes.delete(code, function(err) {

            if (err) return done(err);
            _this.models.accessTokens.save(token.id, clientId,
              resourceOwner, authCode.scopes, refreshToken, tokenTTL,
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

            _this.models.accessTokens.save(token.id, client['client-id'], user.id, scope, null,
              tokenTTL, getTokenHandler(token, done));
          }

          if (ares.authorized) {
            generateAccessToken();
          } else {
            _this.models.permissions.addPermission(client['client-id'], user.id, scope,
              function(err) {
                if (err) {
                  return done(err);
                }
                generateAccessToken();
              });
          }
        }));
    }

    var loginHandlers = [];
    var azHandlers = [
      this.sessionMiddleware, //session
      server.authorization( {sessionKey: SESSION_KEY}, //authorization
        function (ctx, clientId, redirectURI, scope, responseType, done) {
          authorizationValidate.call(server, _this.models, ctx, 
              clientId, redirectURI, scope, responseType, done);
        }
      )
    ];

    var idExtractHandler =  idExtractor({apidoc: apidoc, sessionKey: SESSION_KEY});
    var azAuthenticatedHandler = authorizationAuthenticatedHandler(server);
    //basic auth middleware
    if (idExtract.type === 'basic') {
      azHandlers.push(idExtractHandler);
    } else if (idExtract.type === 'default-form') {
      azHandlers.push(defaultLoginFormRender);

      loginHandlers.push(
          this.sessionMiddleware,
          transactionLoader(server),
          idExtractHandler);
    }

    if (authorizationType.type === 'authenticated') {
      //when using basic auth and authorization === 'authenticated'
      //directly call server._respond
      azHandlers.push(azAuthenticatedHandler);
      loginHandlers.push(azAuthenticatedHandler);
    } else if (authorizationType.type === 'default-form'){
      var checkAuthorizeHandler = isAuthorizedHandler(server, _this.models);
      var consentFormRender = defaultConsentForm({server: server});
      azHandlers.push(checkAuthorizeHandler, consentFormRender);
      loginHandlers.push(checkAuthorizeHandler, consentFormRender);
    }

    //client credentials
    if (allowedGrants.indexOf('application') !== -1) {
      server.exchange(oauth2Provider.exchange.clientCredentials(
        function(client, subject, scope, done) {
          if (validateClient(client, server, {
                scope: scope, grantType: 'application' }, done)) {
            return;
          }

          function generateAccessToken(user) {
            var token = _this.generateToken({
              grant: 'Client Credentials',
              client: client,
              user: user,
              scope: scope
            });
            logger.debug('Generating access token: %j %s %s',
              token, clientInfo(client), scope);

            var refreshToken;
            if (enableRefreshToken) {
              refreshToken = _this.generateToken({
                grant: 'Client Credentials',
                client: client,
                user: user,
                scope: scope,
                refreshToken: true
              }).id;
            }

            _this.models.accessTokens.save(
              token.id, client.id, user && user.id, scope, refreshToken,
              tokenTTL, getTokenHandler(token, done));
          }

          if (subject) {
            _this.models.users.findByUsernameOrEmail(subject, function(err, user) {
              if (err) {
                return done(err);
              }
              if (!user) {
                return done(new TokenError(
                    'Invalid subject: ' + subject, 'access_denied'));
              }
              _this.models.permissions.isAuthorized(client.id, user.id, scope,
                function(err, authorized) {
                  if (err) {
                    return done(err);
                  }
                  if (authorized) {
                    generateAccessToken(user);
                  } else {
                    return done(new TokenError(
                        'Permission denied by ' + subject, 'access_denied'));
                  }
                });
            });
          } else {
            generateAccessToken();
          }
        }));
    }

    //resource owner password
    if (allowedGrants.indexOf('password') !== -1) {
      server.exchange(oauth2Provider.exchange.password(
        function(client, username, password, scope, done) {
          logger.debug('Verifying username/password: %s %s %s',
            clientInfo(client), username, scope);

          if (validateClient(client, server, {
                scope: scope, grantType: 'password' }, done)) {
            return;
          }

          //authenticate the resource owner
          var authCfg = oauth2Cfg.authentication;
          server.userAuthentication(snapid, authCfg, username, password,
            function(err, user) {
              if (err || !user) {
                return done(err, null);
              }

              var token = _this.generateToken({
                grant: 'Resource Owner Password Credentials',
                client: client,
                user: user,
                scope: scope
              });

              var refreshToken;
              if (enableRefreshToken) {
                refreshToken = _this.generateToken({
                  grant: 'Resource Owner Password Credentials',
                  client: client,
                  user: user,
                  scope: scope,
                  refreshToken: true
                }).id;
              }

              logger.debug('Generating access token: %j %s %s %s',
                token, clientInfo(client), username, scope);

              _this.models.accessTokens.save(token.id, client.id, user.id,
                scope, refreshToken, tokenTTL, getTokenHandler(token, done));

          });
        }));
    }

    //refresh token
    if (enableRefreshToken) {
      server.exchange(oauth2Provider.exchange.refreshToken(
        function(client, refreshToken, scope, done) {

          if (validateClient(client, server, {
                scope: scope, grantType: 'refresh_token' }, done)) {
            return;
          }

          _this.models.accessTokens.findByRefreshToken(refreshToken,
            function(err, accessToken) {
              if (err || !accessToken) {
                // Refresh token is not found
                return done(err, false);
              }
              if (accessToken.appId != client.id) {
                // The client id doesn't match
                return done(null, false);
              }

              // Test if scope is a subset of accessToken.scopes
              if (scope) {
                for (var i = 0, n = scope.length; i < n; i++) {
                  if (accessToken.scopes.indexOf(scope[i]) === -1) {
                    return done(null, false);
                  }
                }
              } else {
                scope = accessToken.scopes;
              }

              //TODO: check if the refresh token itself is expired

              var token = _this.generateToken({
                grant: 'Refresh Token',
                client: client,
                scope: scope
              });

              var refreshToken = _this.generateToken({
                grant: 'Refresh Token',
                client: client,
                scope: scope,
                refreshToken: true
              }).id;

              logger.debug('Generating access token: %j %s %s %j',
                token, clientInfo(client), scope, refreshToken);

              _this.models.accessTokens.save(token.id, client.id, accessToken.userId,
                scope, refreshToken, tokenTTL, getTokenHandler(token, done));
            });
        }));
    }

    var tokenHandlers = [
      server.authentication(oauth2Cfg.authentication, _this.models),
      server.token()
    ];

    server.azHandlers = azHandlers;
    server.loginHandlers = loginHandlers;
    server.tokenHandlers = tokenHandlers;
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
        //only verify responseType here 
        //verify redirectURI inside authorization middleware
        if (validateClient(client, server,
            {
              responseType: responseType
            }, done)) {
          return;
        }
        return done(null, client, redirectURI);
      }
  );
}

function generateJWTToken(options) {
  options = options || {};
  var id = uid(32);
  var secret = options.client['client-secret'];
  var payload = {
    id: id,
    clientId: options.client['client-id'],
    userId: options.user && options.user.id,
    scope: options.scope,
    createdAt: new Date()
  };

  var token = helpers.generateJWT(payload, secret, 'HS256');
  return {
    id: token
  };
};

/**
 * get a handler function to check if the client is authorized or not
 */
function isAuthorizedHandler(server, models) {
  // Check if the user has granted permissions to the client app
  return function(req, res, next) {
    var userId = req.oauth2.user.id;
    var clientId = req.oauth2.client['cliient-id]'];
    var scope = req.oauth2.req.scope;
    models.permissions.isAuthorized(clientId, userId, scope,
      function(err, authorized) {
        if (err) {
          logger.error('Failed in checking if the client is authorized.', err);
          return next(new AuthorizationError(
                      'Found errors when checking if the client is authorized',
                      'server_error'));
        } else if (authorized) {
          req.oauth2.res = {};
          req.oauth2.res.allow = true;
          server._respond(req.oauth2, req.ctx, function(err) {
            if (err) {
              logger.error('Failed in server response handler.', err);
              return next(new AuthorizationError(
                      'Found errors in the server response handler',
                      'server_error'));
            }
            return next(new AuthorizationError(
                        'The resource owner didn\'t grant the permission',
                        'access_denied'));
          });
        } else {
          next();
        }
      });
  };
}

/**
 * get a handler to handle the 'authorization:authenticated' case
 */
function authorizationAuthenticatedHandler(server) {
  return function (req, res, next) {
    if (req.oauth2.client.logined && req.oauth2.client.logined === true) {
      req.oauth2.res = {allow: true};
      server._respond(req.oauth2, req.ctx, function(err) {
        if (err && err !== 'route') {
          logger.error('Failed in server response handler.', err);
          return next(new AuthorizationError(
                      'Found errors in the server response handler',
                      'server_error'));
        }
        return next();
      });
    } else {
      return next(new AuthorizationError(
                  'The grant request hasn\'t been authenticated yet',
                  'unauthorized_client'));
    }
  };
}

function decisionView() {
  return function (req, res, next) {
    req.ctx.message.body = 'This is the consent form';
    next();
  };
}
