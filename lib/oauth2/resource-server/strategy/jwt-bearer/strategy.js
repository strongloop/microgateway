// Copyright IBM Corp. 2014,2015. All Rights Reserved.
// Node module: loopback-component-oauth2
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

// Folked from
// https://github.com/jaredhanson/passport-oauth2-jwt-bearer/tree/develop
// MIT license

/**
 * Module dependencies.
 */
var passport = require('passport-strategy');
var util = require('util');
var jwt = require('jws');

/**
 * `ClientJWTBearerStrategy` constructor.
 *
 * @api protected
 */
function Strategy(options, keying, verify) {
  if (typeof options === 'function') {
    verify = keying;
    keying = options;
    options = undefined;
  }
  options = options || {};

  var audience = options.audience;

  if (!audience) {
    throw new TypeError('OAuth 2.0 JWT bearer strategy requires an audience option');
  }
  if (!keying) {
    throw new TypeError('OAuth 2.0 JWT bearer strategy requires a keying callback');
  }
  if (!verify) {
    throw new TypeError('OAuth 2.0 JWT bearer strategy requires a verify callback');
  }

  if (!Array.isArray(audience)) {
    audience = [ audience ];
  }

  passport.Strategy.call(this);
  this.name = 'oauth2-jwt-bearer';
  this._audience = audience;
  this._keying = keying;
  this._verify = verify;
  this.jwtAlgorithm = options.jwtAlgorithm || 'RS256';

  this._passReqToCallback = options.passReqToCallback;
}

/**
 * Inherit from `passport.Strategy`.
 */
util.inherits(Strategy, passport.Strategy);

/**
 * Authenticate request based on client credentials from the claimSet.iss of the JWT in the request body.
 *
 * @param {Object} req
 * @api protected
 */
Strategy.prototype.authenticate = function(req) {
  if (!req.body) {
    return this.fail();
  }

  var jwt_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
  var jwt_grant_type = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
  if (req.body.grant_type !== jwt_grant_type
    && req.body.client_assertion_type !== jwt_assertion_type) {
    return this.fail();
  }

  var self = this,
    assertion = (req.body.grant_type === jwt_grant_type) ? req.body['assertion'] :
      req.body['client_assertion'];

  if(!assertion) {
    return this.fail(400);
  }

  // Decode the JWT so the header and payload are available, as they contain
  // fields needed to find the corresponding key.  Note that at this point, the
  // assertion has not actually been verified.  It will be verified later, after
  // the keying material has been retrieved.
  var token = jwt.decode(assertion, { json: true });
  if (!token) {
    return this.fail(400);
  }

  var header = token.header
    , payload = token.payload;

  //console.log(token);
  //console.log(payload);

  // Validate the assertion.
  // http://tools.ietf.org/html/draft-ietf-oauth-jwt-bearer-07#section-3
  if (!payload.iss) {
    return this.fail(400);
  }
  if (!payload.sub) {
    return this.fail(400);
  }
  if (!payload.aud) {
    return this.fail(400);
  }
  if (!payload.exp) {
    return this.fail(400);
  }

  if (this._audience.indexOf(payload.aud) === -1) {
    return this.fail();
  }

  var now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) { // expired
    return this.fail();
  }
  if (payload.nbf && payload.nbf > now) { // not yet acceptable
    return this.fail();
  }

  function doKeyingStep() {
    function keyed(err, key) {
      if (err) {
        return self.error(err);
      }
      if (!key) {
        return self.fail();
      }

      // The key has been retrieved, verify the assertion.  `key` is a PEM
      // encoded RSA public key, DSA public key, or X.509 certificate, as
      // supported by Node's `crypto` module.
      var ok = jwt.verify(assertion, self.jwtAlgorithm, key);
      if (!ok) {
        return self.fail();
      }
      doVerifyStep();
    }

    try {
      var arity;
      if (self._passReqToCallback) {
        arity = self._keying.length;
        if (arity === 4) {
          self._keying(req, payload.iss, header, keyed);
        } else { // arity == 3
          self._keying(req, payload.iss, keyed);
        }
      } else {
        arity = self._keying.length;
        if (arity === 3) {
          self._keying(payload.iss, header, keyed);
        } else { // arity == 2
          self._keying(payload.iss, keyed);
        }
      }
    } catch (ex) {
      return self.error(ex);
    }
  }

  function doVerifyStep() {
    function verified(err, client, info) {
      if (err) {
        return self.error(err);
      }
      if (!client) {
        return self.fail();
      }
      self.success(client, info);
    }

    var arity;

    // At this point, the assertion has been verified and authentication can
    // proceed.  Call the verify callback so the application can find and verify
    // the client instance.  Typically, the subject and issuer of the assertion
    // are the same, as the client is authenticating as itself.
    try {
      if (self._passReqToCallback) {
        arity = self._verify.length;
        if (arity === 5) {
          // This variation allows the application to detect the case in which
          // the issuer and subject of the assertion are different, and permit
          // or deny as necessary.
          self._verify(req, payload.iss || header.iss, payload.sub, payload,
            verified);
        } else { // arity == 4
          self._verify(req, payload.iss || header.iss, payload.sub, verified);
        }
      } else {
        arity = self._verify.length;
        if (arity === 4) {
          self._verify(payload.iss, payload.sub, payload, verified);
        } else { // arity == 3
          self._verify(payload.iss, payload.sub, verified);
        }
      }
    } catch (ex) {
      return self.error(ex);
    }
  }

  doKeyingStep();
};

/**
 * Expose `Strategy`.
 */
module.exports = Strategy;
