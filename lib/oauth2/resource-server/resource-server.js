// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

// Based on the resource-server from the `loopback-component-oauth2` Node module,
// but modified to work within the `microgateway` infrastructure.

'use strict';

var _ = require('lodash');
var assert = require('assert');
var qs = require('querystring');
var AuthorizationError = require('../errors/authorizationerror');
var passport = require('passport');
// TODO may need ability to have multiple Passport instances
//var Passport = require('passport').Passport;
var jwt = require('jws');
var BearerStrategy = require('passport-http-bearer').Strategy;

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth:resource-server' });

module.exports = setupResourceServer;

function InvalidTokenError(message, status) {
  var DEFAULT_MESSAGE = 'Invalid token';
  var DEFAULT_STATUS = 401;
  if (arguments.length === 0) {
    message = DEFAULT_MESSAGE;
    status = DEFAULT_STATUS;
  } else if (arguments.length === 1) {
    if (typeof message === 'number') {
      status = message;
      message = DEFAULT_MESSAGE;
    } else {
      status = DEFAULT_STATUS;
    }
  }

  return new AuthorizationError(message, 'invalid_token', undefined, status);
}

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
    } catch (err) {
      return err;
    }
  }

  function verifyTokenFormat(accessToken) {
    try {
      assert.equal(typeof accessToken.jti, 'string', 'accessToken.jti must be a string');
      assert.equal(typeof accessToken.aud, 'string', 'accessToken.aud must be a string');
      assert(!Object.is(accessToken.iat.getTime(), NaN), 'accessToken.iat must represent a valid date');
      assert(!Object.is(accessToken.exp.getTime(), NaN), 'accessToken.exp must represent a valid date');
    } catch (err) {
      return err;
    }
  }

  function decodeToken(jwtToken) {
    var decoded = jwt.decode(jwtToken);
    var error;
    if (!decoded || !decoded.payload) {
      error = InvalidTokenError('Could not decode token');
      logger.error(error, jwtToken);
      return error;
    }
    var token;
    try {
      token = JSON.parse(decoded.payload);
    } catch (err) {
      error = InvalidTokenError('Token payload could not be parsed');
      logger.error(error, jwtToken, decoded);
      return error;
    }
    token.iat = new Date(token.iat);
    token.exp = new Date(token.exp);
    return token;
  }

  function scopesSatisfied(requiredScopes, tokenScopes) {
    return _.every(requiredScopes, function(scope) {
      return _.includes(tokenScopes, scope);
    });
  }


  function jwtAccessTokenValidator(req, jwtToken, done) {
    // accessToken = {
    //   jti: id,
    //   aud: clientId,
    //   scope: scope,
    //   iat: iat // createdAt
    // }
    var accessToken = decodeToken(jwtToken);

    if (accessToken instanceof Error) {
      return done(accessToken);
    }

    var formatError = verifyTokenFormat(accessToken);
    if (formatError) {
      logger.error('Access token has invalid format (%s): %j', formatError.message, accessToken);
      return done(new AuthorizationError('Access token has an invalid format', 'invalid_request'));
    }

    logger.debug('Received accessToken: %j', accessToken);

    if ((new Date(accessToken.exp)) < (new Date())) {
      var error = InvalidTokenError('Access token is expired');
      logger.error(error, accessToken);
      return done(error);
    }

    models.accessTokens.findById(accessToken.jti, function(err, token) {
      if (err) {
        logger.error(err);
        return done(new AuthorizationError('Server error', 'server_error'));
      }

      if (!token) {
        err = InvalidTokenError('Access token not found');
        logger.error(err, accessToken);
        return done(err);
      }

      logger.debug('Access token found: %j', token);

      if (!jwt.verify(jwtToken, 'HS256', token.secret)) {
        err = InvalidTokenError('Access token cannot be verified');
        logger.error(err, jwtToken, accessToken, token);
        return done(err);
      }

      var matchErr = compareAccessToken(accessToken, token);
      if (matchErr) {
        logger.error('Token mismatch error (%s): %j %j', matchErr.message, accessToken, token);
        return done(InvalidTokenError('Token mismatch'));
      }

      logger.debug('Access token verified: %j', token);

      if (!scopesSatisfied(req.oauth2.requiredScopes, token.scopes)) {
        var msg = 'invalid_scope: did not match the requested resource: ';
        msg += JSON.stringify(req.oauth2.requiredScopes);
        err = InvalidTokenError(msg, 403);
        logger.error(err, token.scopes, req.oauth2.requiredScopes);
        return done(err);
      }

      //check whether the appId in the query is valid
      if (req.query) {
        var receivedAppId = qs.parse(req.query).appId;
        if (receivedAppId && receivedAppId !== token.appId) {
          err = InvalidTokenError('Access to resource denied due to mismatching client_id', 403);
          logger.error(err, receivedAppId, token.appId);
          return done(err);
        }
      }

      done(null,
        {
          accessToken: token,
          resOwner: token.userId,
          origToken: jwtToken });
    });
  }

  var jwtBearerStrategy = new BearerStrategy(
    { passReqToCallback: true }, jwtAccessTokenValidator);
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
    var defaultCallback = function() {};

    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    options = options || {};
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
