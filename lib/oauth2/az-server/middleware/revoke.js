// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var TokenError = require('../../errors/tokenerror');

/**
 * https://tools.ietf.org/html/rfc7009
 *
 * @param {Server} server
 * @param {Object} options
 * @return {Function}
 * @api protected
 */
module.exports = function revoke(server, options, revokeToken) {
  if (typeof options === 'function' && revokeToken === undefined) {
    revokeToken = options;
    options = {};
  }
  options = options || {};

  if (!server) {
    throw new TypeError(
      'oauth2orize.revoke middleware requires a server argument');
  }

  if (typeof revokeToken !== 'function') {
    throw new TypeError(
      'oauth2orize.revoke middleware requires a revokeToken function');
  }

  var userProperty = options.userProperty || 'user';

  return function revoke(req, res, next) {

    // The 'user' property of `req` holds the authenticated user.  In the case
    // of the token endpoint, the property will contain the OAuth 2.0 client.
    var client = req[userProperty];

    var token = (req.body && req.body.token) || req.query.token;
    if (!token) {
      return next(new TokenError(
        'Missing required parameter: token', 'invalid_request'));
    }
    var type = (req.body && req.body.token_type_hint) ||
      req.query.token_type_hint || 'access_token';

    if (type !== 'refresh_token' && type !== 'access_token') {
      return next(new TokenError(
        'Unsupported token type: ' + type, 'unsupported_token_type'));
    }

    revokeToken(client, token, type, function(err) {
      if (err) {
        return next(err);
      } else {
        req.ctx.message.status = { code: 200, reason: 'OK' };
        next('route');
      }
    });

  };
};
