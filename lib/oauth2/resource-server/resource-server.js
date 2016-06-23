// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

// Based on the resource-server from the `loopback-component-oauth2` Node module,
// but modified to work within the `microgateway` infrastructure.

'use strict';

var _ = require('lodash')
  , async = require('async')
  , assert = require('assert')
  , util   = require('util')
  , oauth2Provider = require('../az-server/oauth2orize')
  , scopeValidator = require('./scope')
  , helpers = require('../oauth2-helper')
  , AuthorizationError = require('../errors/authorizationerror')
  , passport = require('passport')
  // TODO may need ability to have multiple Passport instances
  //, Passport = require('passport').Passport
  , jwt = require('jws')
  , BearerStrategy = require('passport-http-bearer').Strategy;

var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:resource-server'});

var clientInfo = helpers.clientInfo;
var userInfo = helpers.userInfo;
var isExpired = helpers.isExpired;

module.exports = setupResourceServer;

function InvalidTokenError (message, code, status) {
  Error.call(this);
  Error.captureStackTrace(this, InvalidTokenError);
  this.name = 'InvalidTokenError';
  this.message = message;
  this.code = code || 'invalid_token';
  this.status = status || 401;
}

util.inherits(InvalidTokenError, Error);

/**
 * Set up oAuth 2.0 strategies
 * @param {Object} app App instance
 * @param {Object} options Options
 * @param {Object} models oAuth 2.0 metadata models
 * @param {Boolean} jwt if jwt-bearer should be enabled
 * @returns {Function}
 */
function setupResourceServer(app, options, models) {

  // TODO may need ability to have multiple Passport instances
  //var passport = options.passport || new Passport();

  function compareAccessToken(accessToken, token) {
    try {
      assert.equal(accessToken.jti, token.id, 'accessToken.jti must match token.id');
      assert.equal(accessToken.aud, token.appId, 'accessToken.aud must match token.appId');
      assert.equal(accessToken.iat.getTime(), token.issuedAt.getTime(), 'accessToken.iat must match token.issuedAt');
      assert.equal(accessToken.exp.getTime(), token.expiredAt.getTime(), 'accessToken.exp must match token.expiredAt');
    }
    catch (err) {
      return err;
    }
  }

  function verifyTokenFormat (accessToken) {
    try {
      assert.equal(typeof accessToken.jti, 'string', 'accessToken.jti must be a string');
      assert.equal(typeof accessToken.aud, 'string', 'accessToken.aud must be a string');
      assert(!Object.is(accessToken.iat.getTime(), NaN), 'accessToken.iat must represent a valid date');
      assert(!Object.is(accessToken.exp.getTime(), NaN), 'accessToken.exp must represent a valid date');
    }
    catch (err) {
      return err;
    }
  }

  function decodeToken (jwtToken) {
    var decoded = jwt.decode(jwtToken);
    var error;
    if (!decoded || !decoded.payload) {
      error = new InvalidTokenError('Could not decode token');
      logger.debug(error, jwtToken);
      return error;
    }
    var token;
    try {
      token = JSON.parse(decoded.payload);
    }
    catch (err) {
      error = new InvalidTokenError('Token payload could not be parsed');
      logger.debug(error, jwtToken, decoded);
      return error;
    }
    token.iat = new Date(token.iat);
    token.exp = new Date(token.exp);
    return token;
  }

  function scopesSatisfied (requiredScopes, tokenScopes) {
    return _.every(requiredScopes, function (scope) {
      return _.includes(tokenScopes, scope);
    });
  }


  function jwtAccessTokenValidator (req, jwtToken, done) {
    // accessToken = {
    //   jti: id,
    //   aud: clientId,
    //   scope: scope,
    //   iat: iat // createdAt
    // }
    var accessToken = decodeToken(jwtToken);

    if (accessToken instanceof Error)
      return done(accessToken);

    var formatError = verifyTokenFormat(accessToken);
    if (formatError) {
      logger.error('Access token has invalid format (%s): %j', formatError.message, accessToken);
      return done(new AuthorizationError('Access token has an invalid format', 'invalid_request'));
    }

    logger.debug('Received accessToken: %j', accessToken);

    if ((new Date(accessToken.exp)) < (new Date())) {
      var error = new InvalidTokenError('Access token is expired');
      logger.debug(error, accessToken);
      return done(error);
    }

    models.accessTokens.findById(accessToken.jti, function (err, token) {
      if (err) {
        logger.error(err);
        return done(new AuthorizationError('Server error', 'server_error'));
      }

      if (!token) {
        logger.error('Access token not found');
        return done(new AuthorizationError('Access token not found', 'invalid_token'));
      }

      logger.debug('Access token found: %j', token);

      if (!jwt.verify(jwtToken, 'HS256', token.secret)) {
        logger.error('Access token cannot be verified');
        return done(new AuthorizationError('Access token cannot be verified', 'invalid_token'));
      }

      var matchErr = compareAccessToken(accessToken, token);
      if (matchErr) {
        logger.error('Token mismatch error (%s): %j %j', matchErr.message, accessToken, token);
        return done(new AuthorizationError('Token mismatch', 'invalid_token'));
      }

      logger.debug('Access token verified: %j', token);

      //if (isExpired(token))
      //  return done(new TokenError('Access token is expired', 'invalid_grant'));

      if (!scopesSatisfied(req.oauth2.requiredScopes, token.scopes)) {
        logger.error('Token does not satisfy scopes required by API');
        return done(new AuthorizationError('Token has insufficient scope', 'invalid_scope'));
      }

      var userId = token.userId; // || token.resourceOwner;
      var appId  = token.appId;  // || token.clientId;

      Promise.all([
        function lookupUser () {
          return new Promise(function (resolve, reject) {
            if (!userId)
              return resolve(null);
            models.users.find(userId, function (err, user) {
              if (err) {
                logger.error(err);
                err = new AuthorizationError('Server error', 'server_error');
                return reject(err);
              }
              if (!user) {
                err = new AuthorizationError('Access token has invalid user id: ' + userId, 'invalid_client');
                return reject(err);
              }
              logger.debug('User found: %s', userInfo(user));
              resolve(user);
            });
          });
        },
        function lookupApp () {
          return new Promise(function (resolve, reject) {
            if (!appId)
              return resolve(null);
            models.clients.find(appId, function (err, app) {
              if (err) {
                logger.error(err);
                err = new AuthorizationError('Server error', 'server_error');
                return reject(err);
              }
              if (err || !app) {
                err = new AuthorizationError('Access token has invalid app id: ' + appId, 'invalid_client');
                reject(err);
              }
              logger.debug('Client found: %s', clientInfo(app));
              resolve(app);
            });
          })
        }
      ]).then(function (results) {
        var user = results[0], app = results[1];
        var info = { accessToken: token, user: user, app: app, client: app };
        done(null, user || {}, info);
      }, function (err) { done(err); });
    });
  }

  var jwtBearerStrategy = new BearerStrategy(
    { passReqToCallback: true },
    jwtAccessTokenValidator);
  passport.use('microgateway-oauth2-jwt-bearer', jwtBearerStrategy);

  /// **
  // * Return the middleware chain to enforce oAuth 2.0 authentication and
  // * authorization
  // * @param {Object} [options] Options object
  // * - scope
  // * - jwt
  // * /
  //function authenticate(options) {
  //  options = options || {};
  //  logger.debug('Setting up authentication:', options);

  //  var authenticators = [];
  //  authenticators = [
  //    passport.authenticate(['loopback-oauth2-bearer', 'loopback-oauth2-mac'],
  //      options)];
  //  if (options.scopes || options.scope) {
  //    authenticators.push(scopeValidator(options));
  //  }
  //  authenticators.push(oauth2Provider.errorHandler());
  //  return authenticators;
  //}

  /**
   * Return the middleware chain to enforce oAuth 2.0 authentication and
   * authorization
   * @param {Object} [options] Options object
   * - scope
   * - jwt
   * @param {Function} callback
   */
  function authenticate(options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options  = {};
    }

    options  = options || {};
    callback = callback || defaultCallback;

    logger.debug('Setting up authentication:', options);

    var authmw = passport.authenticate('microgateway-oauth2-jwt-bearer', options, callback);
    var authenticators = [ authmw ];
    //if (options.scopes || options.scope) {
    //  authenticators.push(scopeValidator(options));
    //}
    //authenticators.push(oauth2Provider.errorHandler());
    return authenticators;
  }

  return { authenticate: authenticate };
}
