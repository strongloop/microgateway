// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var merge = require('lodash').extend;
var TokenError = require('../../errors/tokenerror');


/**
 * Refresh previously issued access tokens.
 *
 * This exchange middleware is used to by clients to refresh an access token by
 * using a refresh token issued by the server.
 *
 * Callbacks:
 *
 * This middleware requires an `issue` callback, for which the function
 * signature is as follows:
 *
 *     function(client, refreshToken, scope, done) { ... }
 *
 * `client` is the authenticated client instance attempting to obtain an access
 * token.  `refreshToken` is the refresh token issued by the server.  `scope` is
 * the scope of access requested by the client, which must not include any scope
 * not originally granted.  `done` is called to issue an access token:
 *
 *     done(err, accessToken, refreshToken, params)
 *
 * `accessToken` is the access token that will be sent to the client.  An
 * optional `refreshToken` will be sent to the client, if the server chooses to
 * implement support for this functionality.  Any additional `params` will be
 * included in the response.  If an error occurs, `done` should be invoked with
 * `err` set in idomatic Node.js fashion.
 *
 * Options:
 *     scopeSeparator  separator used to demarcate scope values (default: ' ')
 *
 * Examples:
 *
 *     server.exchange(oauth2orize.exchange.refreshToken(function(client, refreshToken, scope, done) {
 *       AccessToken.create(client, refreshToken, scope, function(err, accessToken) {
 *         if (err) { return done(err); }
 *         done(null, accessToken);
 *       });
 *     }));
 *
 * References:
 *  - [Refreshing an Access Token](http://tools.ietf.org/html/draft-ietf-oauth-v2-28#section-6)
 *
 * @param {Object} options
 * @param {Function} issue
 * @api public
 */
module.exports = function(options, issue) {
  if (typeof options === 'function') {
    issue = options;
    options = undefined;
  }
  options = options || {};

  if (!issue) {
    throw new TypeError(
        'oauth2orize.refreshToken exchange requires an issue callback');
  }

  // For maximum flexibility, multiple scope spearators can optionally be
  // allowed.  This allows the server to accept clients that separate scope
  // with either space or comma (' ', ',').  This violates the specification,
  // but achieves compatibility with existing client libraries that are already
  // deployed.
  var separators = options.scopeSeparator || ' ';
  if (!Array.isArray(separators)) {
    separators = [ separators ];
  }

  return function refresh_token(req, next) {
    // In the case of the token endpoint, the authenticated client can be found
    // in the `req.oauth2`.
    var client = req.oauth2;
    var refreshToken = req.ctx.request.parameters.refresh_token;
    var scope = req.ctx.request.parameters.scope;

    if (!refreshToken) {
      return next(new TokenError(
              'Missing required parameter "refresh_token"',
              'invalid_request'));
    }

    if (scope) {
      for (var i = 0, len = separators.length; i < len; i++) {
        var separated = scope.split(separators[i]);
        // only separate on the first matching separator. this allows for a sort
        // of separator "priority" (ie, favor spaces then fallback to commas)
        if (separated.length > 1) {
          scope = separated;
          break;
        }
      }

      if (!Array.isArray(scope)) {
        scope = [ scope ];
      }
    }

    function issued(err, accessToken, refreshToken, params) {
      if (err) {
        return next(err);
      }

      if (!accessToken) {
        return next(new TokenError(
                'Invalid refresh token',
                'invalid_grant'));
      }

      var tok = {};
      tok.access_token = accessToken;

      if (refreshToken) {
        if (typeof refreshToken === 'object') {
          params = refreshToken;
        } else {
          tok.refresh_token = refreshToken;
        }
      }

      if (params) {
        merge(tok, params);
      }

      tok.token_type = tok.token_type || 'Bearer';

      var json = JSON.stringify(tok);
      req.ctx.message.headers['Content-Type'] = 'application/json';
      req.ctx.message.headers['Cache-Control'] = 'no-store';
      req.ctx.message.headers['Pragma'] = 'no-cache';
      req.ctx.message.body = json;

      next('route');
    }

    try {
      var arity = issue.length;
      if (arity === 4) {
        issue(client, refreshToken, scope, issued);
      } else { // arity == 3
        issue(client, refreshToken, issued);
      }
    } catch (ex) {
      return next(ex);
    }
  };
};
