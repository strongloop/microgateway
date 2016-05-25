// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: loopback-component-oauth2
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/**
 * Module dependencies.
 */
var passport = require('passport-strategy')
  , util = require('util')
  , MACGenerator = require('../../mac-token');

/**
 * Creates an instance of `Strategy`.
 *
 * The HTTP MAC authentication strategy authenticates requests based on
 * a mac token contained in the `Authorization` header field, `access_token`
 * body parameter, or `access_token` query parameter.
 *
 * Applications must supply a `verify` callback, for which the function
 * signature is:
 *
 *     function(token, done) { ... }
 *
 * `token` is the mac token provided as a credential.  The verify callback
 * is responsible for finding the user who posesses the token, and invoking
 * `done` with the following arguments:
 *
 *     done(err, user, info);
 *
 * If the token is not valid, `user` should be set to `false` to indicate an
 * authentication failure.  Additional token `info` can optionally be passed as
 * a third argument, which will be set by Passport at `req.authInfo`, where it
 * can be used by later middleware for access control.  This is typically used
 * to pass any scope associated with the token.
 *
 * Options:
 *
 *   - `algorithm`  mac key
 *   - `key`  mac key
 *
 * Examples:
 *
 *     passport.use(new MACStrategy(
 *       function(token, done) {
 *         User.findByToken({ token: token }, function (err, user) {
 *           if (err) { return done(err); }
 *           if (!user) { return done(null, false); }
 *           return done(null, user, { scope: 'read' });
 *         });
 *       }
 *     ));
 *
 * For further details on HTTP MAC authentication, refer to [OAuth 2.0 Message Authentication Code (MAC) Tokens](https://tools.ietf.org/html/draft-ietf-oauth-v2-http-mac-05)
 *
 * @constructor
 * @param {Object} [options]
 * @param {Function} verify
 * @api public
 */
function Strategy(options, verify) {
  if (typeof options === 'function') {
    verify = options;
    options = {};
  }
  if (!verify) {
    throw new TypeError('MACStrategy requires a verify callback');
  }

  passport.Strategy.call(this);
  this.name = 'oauth2-mac';
  this._verify = verify;
  this._algorithm = options.algorithm || 'sha256';
  this._passReqToCallback = options.passReqToCallback;
  this._macGenerator = new MACGenerator(this._algorithm);
}

/**
 * Inherit from `passport.Strategy`.
 */
util.inherits(Strategy, passport.Strategy);

/**
 * Authenticate request based on the contents of a HTTP MAC authorization
 * header.
 *
 * @param {Object} req
 * @api protected
 */
Strategy.prototype.authenticate = function(req) {
  var authorizationHeader = req.get('authorization');
  if (!(authorizationHeader && authorizationHeader.indexOf('MAC ') === 0)) {
    return this.fail();
  }

  var token = this._macGenerator.validate(req);

  if (!token) {
    return this.fail(this._challenge('Invalid MAC token'));
  }

  var self = this;

  function verified(err, user, info) {
    if (err) {
      return self.error(err);
    }
    if (!user) {
      if (typeof info === 'string') {
        info = { message: info };
      }
      info = info || {};
      return self.fail(self._challenge('invalid_token', info.message));
    }
    self.success(user, info);
  }

  if (self._passReqToCallback) {
    this._verify(req, token, verified);
  } else {
    this._verify(token, verified);
  }
};

/**
 * Build authentication challenge.
 *
 * @api private
 */
Strategy.prototype._challenge = function(err) {
  var challenge = 'MAC ';

  if (err) {
    challenge += ' error="' + err + '"';
  }

  return challenge;
};

/**
 * Expose `Strategy`.
 */
module.exports = Strategy;
