// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var async = require('async');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth:az-server' });

var models = require('../models');
var helpers = require('../oauth2-helper');
var oauth2Provider = require('./oauth2orize');
var idExtractor = require('./middleware/id-extractor');
var defaultLoginForm = require('./middleware/default-login-form');
var customLoginForm = require('./middleware/custom-login-form');
var redirect = require('./middleware/redirect');
var defaultConsentForm = require('./middleware/default-consent-form');
var customConsentForm = require('./middleware/custom-consent-form');
var transactionLoader = require('./middleware/transactionLoader');
var AuthorizationError = require('../errors/authorizationerror');
var TokenError = require('../errors/tokenerror');

var validateClient = helpers.validateClient;
var isExpired = helpers.isExpired;

var SESSION_KEY = 'authorize';
var defaultLoginFormRender;

var APPLICATION_GRANT = 'application';
var PASSWORD_GRANT = 'password';
var ACCESSCODE_GRANT = 'accessCode';
var IMPLICIT_GRANT = 'implicit';
var REFRESHTOKEN_GRANT = 'refreshToken';

/*
 * config should contains:
 * - app : the express application
 */
module.exports = function(config) {

  //we decide to use JWT as the token format
  config = config || {};
  var generateToken = config.generateToken || generateJWTToken;
  var oauthModels = models.getInstance(
      helpers.getDSDef(config.datasourceDef));
  var sessionSecret = config.sessionSecret || 'microgateway oauth2 session';
  var serverPool = new ServerPool({
    models: oauthModels.models,
    sessionSecret: sessionSecret,
    generateToken: generateToken });

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
        || swagger['x-ibm-configuration'].type !== 'oauth') {
      next();
      return;
    }


    //purge the expired code/permission/token before processing
    serverPool.models.accessTokens.purge();
    serverPool.models.refreshTokens.purge();
    serverPool.models.permissions.purge();
    serverPool.models.authorizationCodes.purge();

    var routeNext = function(error) {
      if (error === 'route') {
        return next();
      }
      next(error);
    };

    var query = req.query || req.ctx.request.parameters || {};
    var body = req.ctx.request.body || {};
    //when go to this spot, it should be an oauth releated requests
    var parameters = req.ctx.request.parameters;
    var server;
    if (_.isString(query['rstate'] || body['rstate'])) {
      //back from redirect
      req.oauth2 = { type: 'AZ redirect' };
      logger.debug('Receiving an OAuth2 AZ redirect request.');
      server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.redirectHandlers, req, res, routeNext);
    } else if (_.isString(parameters['response_type']) &&
        _.isString(parameters['client_id'])) {
      //handle first AZ requests here
      req.oauth2 = { type: 'AZ req' };
      logger.debug('Receiving an OAuth2 AZ request.');

      server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.azHandlers, req, res, routeNext);
    } else if (req.ctx.request.verb === 'POST' &&
        _.isString(req.ctx.request.body['transaction_id'])) {
      //handle login form
      logger.debug('Receiving an OAuth2 AZ login request.');
      req.oauth2 = { type: 'AZ login' };

      server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.loginHandlers, req, res, routeNext);
    } else if (req.ctx.request.verb === 'POST' &&
        _.isString(req.ctx.request.body['dp-state'])) {
      //handle consent form
      logger.debug('Receiving an OAuth2 AZ consent request.');
      req.oauth2 = { type: 'AZ consent' };

      server = serverPool.getServer(
          req.ctx._.api.id,
          swagger, req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.decisionHandlers, req, res, routeNext);

    } else if (_.isString(parameters['grant_type'])) {
      //handle the token request
      req.oauth2 = { type: 'token' };
      logger.debug('Receiving an OAuth2 token request.', parameters['grant_type']);

      //prepare the response headers for the token request
      req.ctx.message.headers = {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'Content-Type': 'application/json;charset=UTF-8' };

      //handle the token request
      logger.debug('Receiving an OAuth2 token request.');
      server = serverPool.getServer(
          req.ctx._.api.id,
          swagger,
          req.ctx['config-snapshot-id']);

      async.applyEachSeries(server.tokenHandlers, req, res, routeNext);
    } else {
      req.oauth2 = { type: 'invalid' };
      logger.error('Received a unrecognized OAuth2 request.');

      next({
        name: 'OAuth2Error',
        message: 'Received an OAuth2 request with invalid parameters' });
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
      'microgateway oauth2 session';
  this.generateToken = options.generateToken || generateJWTToken;
  //all of the servers use the same one session middleware
  this.sessionMiddleware = helpers.getSessionHandler(
      { resave: true,
        saveUninitialized: true,
        secret: this.sessionSecret,
        cookie: { maxAge: 600000 } });
}

function getTokenHandler(aTkn, rTkn, done) {
  //The `savedToken` should be the record of access token saved in the datastore
  return function(err, savedToken) {
    if (err || !savedToken) {
      return done(err);
    }

    //The additional parameters that need to be included in the token response
    var params = {
      token_type: savedToken.tokenType,
      expires_in: savedToken.expiresIn,
      scope: (savedToken.scopes ? savedToken.scopes.join(' ') : undefined) };

    //OK to call the issued() function of the grant or exchange middlewares
    if (savedToken.grant === IMPLICIT_GRANT) {
      done(null, aTkn.token, params);
    } else {
      done(null, aTkn.token, (rTkn ? rTkn.token : undefined), params);
    }
  };
}

ServerPool.prototype.getServer = function(apiid, apidoc, snapid) {

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

    var tokenTTL = oauth2Cfg['access-token'] &&
        oauth2Cfg['access-token'].ttl || 3600;
    var enableRefreshToken = !!oauth2Cfg['refresh-token'];
    var refreshTTL = enableRefreshToken &&
        oauth2Cfg['refresh-token'].ttl || 2682000;
    var refreshCnt = enableRefreshToken &&
        oauth2Cfg['refresh-token'].count || 2048;
    var clientType = oauth2Cfg['client-type'] || 'public';

    server.scope(Object.getOwnPropertyNames(supportedScopes));
    if (enableRefreshToken) {
      allowedGrants.push(REFRESHTOKEN_GRANT);
    }
    server.grantType(allowedGrants);

    if (allowedGrants.indexOf(ACCESSCODE_GRANT) !== -1) {
      server.grant(oauth2Provider.grant.code(
        { allowsPost: false },
        function(client, redirectURI, user, scope, ares, done) {
          if (validateClient(client, server,
                      { scope: scope, grantType: ACCESSCODE_GRANT }, done)) {
            return;
          }

          var generateAuthCode = function() {
            var clientId = client['client-id'];
            var result = _this.generateToken(clientId, scope, 300); //5 mins

            //We save and return the jwt id as the AZ code
            _this.models.authorizationCodes.save(
              apiid, clientId, user.id, result.id,
              scope, redirectURI, result.issuedAt, result.expiredAt,
              function(err) {
                done(err, err ? null : result.id);
              });
          };

          if (ares.authorized) {
            generateAuthCode();
          } else {
            _this.models.permissions.addPermission(apiid, client['client-id'], user.id, scope,
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
          var clientId = client['client-id'];
          logger.debug('Verifying authorization code: %s %s %s', code, clientId, redirectURI);

          _this.models.authorizationCodes.findByCode(apiid, code, function(err, authCode) {
            if (err || !authCode) {
              return done(err);
            }

            logger.debug('Authorization code found: %j', authCode);

            var resourceOwner = authCode.userId || authCode.resourceOwner;
            // The client id can be a number instead of string
            if (clientId !== authCode.appId && clientId !== authCode.clientId) {
              return done(new TokenError('Client id mismatches',
                'invalid_grant'));
            }

            if (redirectURI !== authCode.redirectURI) {
              return done(new TokenError('Redirect uri mismatches',
                'invalid_grant'));
            }

            if (isExpired(authCode)) {
              return done(new TokenError('Authorization code is expired',
                'invalid_grant'));
            }

            var aTkn = _this.generateToken(clientId, authCode.scopes, tokenTTL);
            aTkn.azCode = code;

            var rTkn;
            if (enableRefreshToken) {
              rTkn = _this.generateToken(clientId, authCode.scopes, refreshTTL);
              rTkn.countDown = refreshCnt;
            }

            _this.models.authorizationCodes.delete(apiid, code, function(err) {
              if (err) {
                return done(err);
              }

              _this.models.accessTokens.save(apiid, clientId, resourceOwner,
                      authCode.scopes, ACCESSCODE_GRANT, aTkn, rTkn,
                      getTokenHandler(aTkn, rTkn, done));
            });
          });
        }));
    }

    if (allowedGrants.indexOf(IMPLICIT_GRANT) !== -1) {
      server.grant(oauth2Provider.grant.token(
        { allowsPost: false },
        function(client, user, scope, ares, done) {
          if (validateClient(client, server,
                      { scope: scope, grantType: IMPLICIT_GRANT }, done)) {
            return;
          }

          function generateAccessToken() {
            var clientId = client['client-id'];
            var aTkn = _this.generateToken(clientId, scope, tokenTTL);

            _this.models.accessTokens.save(apiid, clientId, user.id,
                    scope, IMPLICIT_GRANT, aTkn, undefined,
                    getTokenHandler(aTkn, undefined, done));
          }

          if (ares.authorized) {
            generateAccessToken();
          } else {
            _this.models.permissions.addPermission(apiid, client['client-id'], user.id, scope,
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
    var redirectHandlers = [];
    var azHandlers = [
      this.sessionMiddleware, //session
      server.authorization(
        { sessionKey: SESSION_KEY }, //authorization
        function(ctx, clientId, done) {
          authorizationValidate.call(server, _this.models, ctx, clientId, done);
        }) ];

    var decisionHandlers = [
      this.sessionMiddleware, //session
      transactionLoader(server, { transactionField: 'dp-state' }),
      server.decision() ];

    var azAuthenticatedHandler = authorizationAuthenticatedHandler(server);
    //basic auth middleware
    if (idExtract.type === 'basic') {
      azHandlers.push(idExtractor({
        apidoc: apidoc,
        sessionKey: SESSION_KEY,
        form: false }));
    } else if (idExtract.type === 'default-form') {
      azHandlers.push(defaultLoginFormRender);

      loginHandlers.push(
          this.sessionMiddleware,
          transactionLoader(server),
          idExtractor(
            { apidoc: apidoc,
              sessionKey: SESSION_KEY,
              loginRender: defaultLoginFormRender,
              retryCount: 0,
              form: true }));
    } else if (idExtract.type === 'custom-form') {
      var customLoginFormRender = customLoginForm({
        url: idExtract['custom-form'].url,
        tlsProfile: idExtract['custom-form']['tls-profile'] });
      azHandlers.push(customLoginFormRender);

      loginHandlers.push(
          this.sessionMiddleware,
          transactionLoader(server),
          idExtractor({
            apidoc: apidoc,
            sessionKey: SESSION_KEY,
            loginRender: customLoginFormRender,
            retryCount: 0,
            form: true }));
    } else if (idExtract.type === 'redirect') {
      var redirectHandler = redirect({ redirectURL: idExtract['redirect-url'] });
      azHandlers.push(redirectHandler);

      redirectHandlers.push(
        this.sessionMiddleware,
        transactionLoader(server, { transactionField: 'rstate' }),
        redirectErrorCheckHandler(server),
        idExtractor({ apidoc: apidoc, sessionKey: SESSION_KEY, form: true }),
        redirectAuthorizationHandler(server));
    }

    if (authorizationType.type === 'authenticated') {
      //when using basic auth and authorization === 'authenticated'
      //directly call server._respond
      azHandlers.push(azAuthenticatedHandler);
      loginHandlers.push(azAuthenticatedHandler);
    } else if (authorizationType.type === 'default-form') {
      var checkAuthorizeHandler = isAuthorizedHandler(
          apiid, server, _this.models, { consentAgain: true });
      var consentFormRender = defaultConsentForm(
          { server: server, consentAgain: true });
      azHandlers.push(checkAuthorizeHandler, consentFormRender);
      loginHandlers.push(checkAuthorizeHandler, consentFormRender);
    } else if (authorizationType.type === 'custom-form') {
      var checkAuthorizeHandler2 = isAuthorizedHandler(
          apiid, server, _this.models, { consentAgain: true });
      var consentFormRender2 = customConsentForm(
        {
          server: server, consentAgain: true,
          url: authorizationType['custom-form'].url,
          tlsProfile: authorizationType['custom-form']['tls-profile'],
        });
      azHandlers.push(checkAuthorizeHandler2, consentFormRender2);
      loginHandlers.push(checkAuthorizeHandler2, consentFormRender2);
    }

    //client credentials
    if (allowedGrants.indexOf(APPLICATION_GRANT) !== -1) {
      server.exchange(oauth2Provider.exchange.clientCredentials(
        function(client, scope, done) {
          if (validateClient(client, server,
                      { scope: (scope || ''), grantType: APPLICATION_GRANT }, done)) {
            return;
          }

          function generateAccessToken(user) {
            var clientId = client['client-id'];
            var aTkn = _this.generateToken(clientId, scope, tokenTTL);

            var rTkn;
            if (enableRefreshToken) {
              rTkn = _this.generateToken(clientId, scope, refreshTTL);
              rTkn.countDown = refreshCnt;
            }

            _this.models.accessTokens.save(apiid, clientId, clientId,
                    scope, APPLICATION_GRANT, aTkn, rTkn,
                    getTokenHandler(aTkn, rTkn, done));
          }

          generateAccessToken();
        }));
    }

    //resource owner password
    if (allowedGrants.indexOf(PASSWORD_GRANT) !== -1) {
      server.exchange(oauth2Provider.exchange.password(
        function(client, username, password, scope, done) {
          var clientId = client['client-id'];
          logger.debug('Verifying username/password: %s %s %s',
                  clientId, username, scope);

          if (validateClient(client, server,
                      { scope: (scope || ''), grantType: PASSWORD_GRANT }, done)) {
            return;
          }

          //authenticate the resource owner
          var authCfg = oauth2Cfg.authentication;
          server.userAuthentication(snapid, authCfg, username, password,
            function(err, user) {
              if (err || !user) {
                return done(err, null);
              }

              var aTkn = _this.generateToken(clientId, scope, tokenTTL);

              var rTkn;
              if (enableRefreshToken) {
                rTkn = _this.generateToken(clientId, scope, refreshTTL);
                rTkn.countDown = refreshCnt;
              }

              _this.models.accessTokens.save(apiid, clientId, username,
                      scope, PASSWORD_GRANT, aTkn, rTkn,
                      getTokenHandler(aTkn, rTkn, done));
            });
        }));
    }

    //refresh token
    if (enableRefreshToken) {
      server.exchange(oauth2Provider.exchange.refreshToken(
        function(client, token, scope, done) {
          if (validateClient(client, server,
                      { scope: scope, grantType: REFRESHTOKEN_GRANT }, done)) {
            return;
          }

          helpers.validateToken(_this.models, client.api, token, 'refresh-token',
            function(err, saved) {
              if (err || !saved) {
                logger.error('Unrecognized refresh token (%s)', err);
                return done(err, false);
              }

              //No matter pulic or confidential clients, they must authenticate
              //for the grant type 'application (or //client_credentials)'.
              if (clientType === 'public' && saved.grant === 'application' &&
                      client.clientAuthSkipped === true) {
                return done(new TokenError(
                            'Missing required parameter: client_*',
                            'invalid_request'));
              }

              var clientId = client['client-id'];
              if (saved.appId !== clientId) {
                logger.error('The client is not matched : %s (%s)',
                        clientId, saved.appId);
                return done(null, false);
              }

              if (saved.expiredAt < new Date()) {
                logger.error('The token was already expired at: %s', saved.expiredAt);
                return done(null, false);
              }

              // Test if the current scope is a subset of the issued scopes
              if (scope) {
                for (var i = 0, n = scope.length; i < n; i++) {
                  if (saved.scopes.indexOf(scope[i]) === -1) {
                    logger.error('The scope is not matched : %s (%s)',
                            scope, saved.scopes);
                    return done(null, false);
                  }
                }
              } else {
                scope = saved.scopes;
              }

              var aTkn = _this.generateToken(clientId, scope, tokenTTL);

              //When there is still count, a new refresh token is generated.
              var rTkn;
              if (saved.countDown > 1) {
                rTkn = _this.generateToken(clientId, scope, refreshTTL);
                rTkn.countDown = saved.countDown - 1;
              }

              _this.models.accessTokens.save(apiid, clientId, saved.userId,
                      scope, REFRESHTOKEN_GRANT, aTkn, rTkn,
                      getTokenHandler(aTkn, rTkn, done));

              //Now the cleanup. Delete the used refresh token
              _this.models.refreshTokens.delete(
                clientId,
                saved.id,
                function(err, result) {
                  if (err || !result || result.count === 0) {
                    logger.error('Cannot delete the used refresh token:', err, result);
                  } else {
                    logger.debug('The used refresh token is deleted: %s', saved.id);
                  }
                });

              //Delete the old access token if it is not expired yet
              _this.models.accessTokens.deleteByRefreshToken(
                clientId,
                saved.id,
                function(err, result) {
                  if (!err && result && result.count > 0) {
                    logger.debug('There is %d old access token deleted.', result.count);
                  }
                });
            });
        }));
    }

    var tokenHandlers = [
      server.authentication(clientType, oauth2Cfg.authentication, _this.models),
      server.token() ];

    server.azHandlers = azHandlers;
    server.loginHandlers = loginHandlers;
    server.tokenHandlers = tokenHandlers;
    server.decisionHandlers = decisionHandlers;
    server.redirectHandlers = redirectHandlers;
    this.pool[key] = server;
  }

  return server;
};

/**
 * cleanup the server pool for a specific snapshot id
 * or clean up all
 */
ServerPool.prototype.cleanUp = function(snapid) {
  if (_.isUndefined(snapid)) {
    this.pool = {};
  } else {
    var keys = Object.getOwnPropertyNames(this.pool);
    for (var i = 0, len = keys.length; i < len; i++) {
      var key = keys[i];
      if (key.indexOf(snapid) === 0) {
        delete this.pool[key];
      }
    }
  }
};

function authorizationValidate(models, ctx, clientId, done) {
  logger.debug('Verifying client %s', clientId);

  models.clients.find(ctx['config-snapshot-id'],
      ctx._.api['subscription-id'],
      clientId,
      function(err, client) {
        if (err || !client) {
          return done(new AuthorizationError(
              'Invalid client',
              'invalid_client'));
        }
        logger.debug('Client found: %s', clientId);
        return done(null, client);
      }
  );
}


function generateJWTToken(clientId, scope, ttl) {
  // Moved the actual implementation to `oauth2-helpers.js` so we can use it
  // externally. Leaving this function here for compatibility
  return helpers.generateJWTToken(clientId, scope, ttl);
}

/**
 * get a handler function to check if the client is authorized or not
 */
function isAuthorizedHandler(apiid, server, models, options) {
  options = options || {};
  // Check if the user has granted permissions to the client app
  return function(req, res, next) {
    var userId = req.oauth2.user.id;
    var clientId = req.oauth2.client['cliient-id]'];
    var scope = req.oauth2.req.scope;
    models.permissions.isAuthorized(apiid, clientId, userId, scope,
      function(err, authorized) {
        if (err) {
          logger.error('Failed in checking if the client is authorized.', err);
          return next(new AuthorizationError(
                      'Found errors when checking if the client is authorized',
                      'server_error'));
        } else if (authorized) {
          req.oauth2.res = req.oauth2.res || {};
          req.oauth2.res.scope = scope;
          req.oauth2.res.allow = true;
          if (options.consentAgain && options.consentAgain === true) {
            return next();
          }
          server._respond(req.oauth2, req.ctx, function(err) {
            if (err && err !== 'route') {
              logger.error('Failed in server response handler.', err);
              return next(new AuthorizationError(
                      'Found errors in the server response handler',
                      'server_error'));
            }
            next();
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
  return function(req, res, next) {
    if (req.oauth2.client.logined && req.oauth2.client.logined === true) {
      req.oauth2.res = {
        scope: req.oauth2.req.scope,
        allow: true };
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

function redirectAuthorizationHandler(server) {
  return function(req, res, next) {
    if (req.oauth2.client.logined && req.oauth2.client.logined === true) {
      req.oauth2.res = {
        scope: req.oauth2.req.scope,
        allow: true };
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

function redirectErrorCheckHandler(server) {
  return function(req, res, next) {
    var error = req.query.error || req.ctx.request.body.error;
    if (_.isString(error)) {
      return next(new AuthorizationError(error, 'unauthorized_client'));
    }
    //also check the mandatory params for normal confirmation
    var query = req.query;
    var body = req.ctx.request.body;

    var confirmation = query.confirmation || body.confirmation;
    var username = query.username || body.username;
    if (_.isUndefined(confirmation) || _.isUndefined(username)) {
      return next(new AuthorizationError(
          'badredirect', 'invalid_request'));
    }
    return next();
  };
}
