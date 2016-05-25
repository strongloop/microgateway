// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: loopback-component-oauth2
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var async = require('async')
  //, oauth2Provider = require('./oauth2orize')
  , oauth2Provider = require('../az-server/oauth2orize')
  , scopeValidator = require('./scope')
  //, helpers = require('./oauth2-helper')
  , helpers = require('../oauth2-helper')
  //, TokenError = require('./errors/tokenerror')
  , TokenError = require('../errors/tokenerror')
  , passport = require('passport')
  , jwt = require('jws')
  , BearerStrategy = require('passport-http-bearer').Strategy
  , MacStrategy = require('./strategy/mac').Strategy;

var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:resource-server'});

var clientInfo = helpers.clientInfo;
var userInfo = helpers.userInfo;
var isExpired = helpers.isExpired;

module.exports = setupResourceServer;

/**
 * Set up oAuth 2.0 strategies
 * @param {Object} app App instance
 * @param {Object} options Options
 * @param {Object} models oAuth 2.0 metadata models
 * @param {Boolean} jwt if jwt-bearer should be enabled
 * @returns {Function}
 */
function setupResourceServer(app, options, models) {

  function checkAccessToken(req, accessToken, done) {
    logger.debug('Verifying access token %s', accessToken);
    models.accessTokens.find(accessToken, function(err, token) {
      if (err || !token) {
        return done(err);
      }

      logger.debug('Access token found: %j', token);

      if (isExpired(token)) {
        return done(new TokenError('Access token is expired',
          'invalid_grant'));
      }

      var userId = token.userId || token.resourceOwner;
      var appId = token.appId || token.clientId;

      var user, app;
      async.parallel([
        function lookupUser(done) {
          if (userId == null) {
            return process.nextTick(done);
          }
          models.users.find(userId, function(err, u) {
            if (err) {
              return done(err);
            }
            if (!u) {
              return done(
                new TokenError('Access token has invalid user id: ' +
                  userId, 'invalid_grant'));
            }
            logger.debug('User found: %s', userInfo(u));
            user = u;
            done();
          });
        },
        function lookupApp(done) {
          if (appId == null) {
            return process.nextTick(done);
          }
          models.clients.find(appId, function(err, a) {
            if (err) {
              return done(err);
            }
            if (!a) {
              return done(
                new TokenError('Access token has invalid app id: ' + appId,
                  'invalid_grant'));
            }
            logger.debug('Client found: %s', clientInfo(a));
            app = a;
            done();
          });
        }], function(err) {
        if (err) {
          return done(err);
        }
        if (options.addHttpHeaders) {
          var prefix = 'X-OAUTH2-';
          if (typeof options.addHttpHeaders === 'string') {
            prefix = options.addHttpHeaders;
          }
          if (appId != null) {
            req.headers[prefix + 'CLIENT-ID'] = appId;
          }
          if (userId != null) {
            req.headers[prefix + 'USER-ID'] = userId;
          }
        }
        var authInfo =
        {accessToken: token, user: user, app: app, client: app};
        done(null, user || {}, authInfo);
      });
    });
  }

  var verifyAccessToken = checkAccessToken;
  if (typeof options.checkAccessToken === 'function') {
    verifyAccessToken = options.checkAccessToken;
  }

  function accessTokenValidator(req, accessToken, done) {
    verifyAccessToken(req, accessToken, function(err, user, info) {
      if(!err && info) {
        req.accessToken = info.accessToken;
      }
      done(err, user, info);
    });
  }

  /**
   * BearerStrategy
   *
   * This strategy is used to authenticate users based on an access token (aka a
   * bearer token).  The user must have previously authorized a client
   * application, which is issued an access token to make requests on behalf of
   * the authorizing user.
   */
  passport.use('loopback-oauth2-bearer',
    new BearerStrategy({passReqToCallback: true}, accessTokenValidator)
  );

  passport.use('loopback-oauth2-mac',
    new MacStrategy({passReqToCallback: true, jwtAlgorithm: 'HS256'},
      function(req, accessToken, done) {
        accessTokenValidator(req, accessToken, function(err, user, info) {
          if (err || !user) {
            return done(err, user, info);
          }
          var client = info && info.client;
          var secret = client.clientSecret || client.restApiKey;
          try {
            var token = jwt.verify(accessToken, 'HS256', secret);
            logger.debug('JWT token verified: %j', token);
          } catch (err) {
            logger.debug('Fail to verify JWT: %j', err);
            done(err);
          }
          done(null, user, info);
        });
      })
  );

  /**
   * Return the middleware chain to enforce oAuth 2.0 authentication and
   * authorization
   * @param {Object} [options] Options object
   * - scope
   * - jwt
   */
  function authenticate(options) {
    options = options || {};
    logger.debug('Setting up authentication:', options);

    var authenticators = [];
    authenticators = [
      passport.authenticate(['loopback-oauth2-bearer', 'loopback-oauth2-mac'],
        options)];
    if (options.scopes || options.scope) {
      authenticators.push(scopeValidator(options));
    }
    authenticators.push(oauth2Provider.errorHandler());
    return authenticators;
  }

  return authenticate;
}