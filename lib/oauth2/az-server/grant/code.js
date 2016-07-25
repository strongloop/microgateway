// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var url = require('url');
var _ = require('lodash');

var AuthorizationError = require('../../errors/authorizationerror');
var redirect = require('../../oauth2-helper').redirect;

/**
 * Handles requests to obtain a grant in the form of an authorization code.
 *
 * Callbacks:
 *
 * This middleware requires an `issue` callback, for which the function
 * signature is as follows:
 *
 *     function(client, redirectURI, user, scope, ares, done) { ... }
 *
 * `client` is the client instance making the authorization request.
 * `redirectURI` is the redirect URI specified by the client, and used as a
 * verifier in the subsequent access token exchange.  `user` is the
 * authenticated user approving the request.  `ares` is any additional
 * parameters parsed from the user's decision, including scope, duration of
 * access, etc.  `done` is called to issue an authorization code:
 *
 *     done(err, code)
 *
 * `code` is the code that will be sent to the client.  If an error occurs,
 * `done` should be invoked with `err` set in idomatic Node.js fashion.
 *
 * The code issued in this step will be used by the client in exchange for an
 * access token.  This code is bound to the client identifier and redirection
 * URI, which is included in the token request for verification.  The code is a
 * single-use token, and should expire shortly after it is issued (the maximum
 * recommended lifetime is 10 minutes).
 *
 * Options:
 *
 *     scopeSeparator  separator used to demarcate scope values (default: ' ')
 *
 * Examples:
 *
 *     server.grant(oauth2orize.grant.code(function(client, redirectURI, user, scope, ares, done) {
 *       AuthorizationCode.create(client.id, redirectURI, user.id, scope, function(err, code) {
 *         if (err) { return done(err); }
 *         done(null, code);
 *       });
 *     }));
 *
 * References:
 *  - [Authorization Code](http://tools.ietf.org/html/draft-ietf-oauth-v2-28#section-1.3.1)
 *  - [Authorization Code Grant](http://tools.ietf.org/html/draft-ietf-oauth-v2-28#section-4.1)
 *
 * @param {Object} options
 * @param {Function} issue
 * @return {Object} module
 * @api public
 */
module.exports = function code(options, issue) {
  if (typeof options === 'function') {
    issue = options;
    options = undefined;
  }
  options = options || {};

  if (!issue) {
    throw new TypeError('oauth2orize.code grant requires an issue callback');
  }

  // For maximum flexibility, multiple scope separators can optionally be
  // allowed.  This allows the server to accept clients that separate scope
  // with either space or comma (' ', ',').  This violates the specification,
  // but achieves compatibility with existing client libraries that are already
  // deployed.
  var separators = options.scopeSeparator || ' ';
  if (!Array.isArray(separators)) {
    separators = [ separators ];
  }

  function getParam(req, name) {
    if (options.allowsPost && req.body) {
      return req.query[name] || req.body[name];
    } else {
      return req.query[name];
    }
  }

  /* Parse requests that request `code` as `response_type`.
   *
   * @param {http.ServerRequest} req
   * @api public
   */
  function request(req) {
    var clientID = getParam(req, 'client_id');
    var redirectURI = getParam(req, 'redirect_uri');
    var scope = getParam(req, 'scope');
    var state = getParam(req, 'state');

    if (!clientID) {
      throw new AuthorizationError(
              'Missing required parameter: client_id',
              'invalid_request');
    }

    if (scope) {
      for (var i = 0, len = separators.length; i < len; i++) {
        var separated = scope.split(separators[i]);
        // only separate on the first matching separator.  this allows for a sort
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

    var rev = {
      clientID: clientID,
      redirectURI: redirectURI,
      scope: scope,
      'api-id': req.ctx._.api.id };

    if (!_.isUndefined(state)) {
      rev.state = state;
    }

    return rev;
  }

  /* Sends responses to transactions that request `code` as `response_type`.
   *
   * @param {Object} txn
   * @param {Context} ctx
   * @param {Function} next
   * @api public
   */
  function response(txn, ctx, next) {
    if (!txn.redirectURI) {
      return next(new Error(
                  'Unable to issue redirect for OAuth 2.0 transaction'));
    }

    if (!txn.res.allow) {
      var parsed = url.parse(txn.redirectURI, true);
      delete parsed.search;
      parsed.query.error = 'access_denied';

      if (txn.req && txn.req.state) {
        parsed.query.state = txn.req.state;
      }

      var location = url.format(parsed);
      redirect(ctx, location);

      return next('route');
    }

    function issued(err, code) {
      if (err) {
        return next(err);
      }

      if (!code) {
        return next(new AuthorizationError(
                    'Request denied by authorization server',
                    'access_denied'));
      }

      var parsed = url.parse(txn.redirectURI, true);
      delete parsed.search;
      parsed.query.code = code;

      if (txn.req && txn.req.state) {
        parsed.query.state = txn.req.state;
      }

      var location = url.format(parsed);
      redirect(ctx, location);

      return next('route');
    }

    // NOTE: The `redirect_uri`, if present in the client's authorization
    //       request, must also be present in the subsequent request to exchange
    //       the authorization code for an access token.  Acting as a verifier,
    //       the two values must be equal and serve to protect against certain
    //       types of attacks.  More information can be found here:
    //
    //       http://hueniverse.com/2011/06/oauth-2-0-redirection-uri-validation/

    try {
      var scope = txn.res.scope || txn.req.scope;
      var arity = issue.length;
      if (arity === 6) {
        issue(txn.client, txn.req.redirectURI, txn.user, scope, txn.res, issued);
      } else { // arity == 5
        issue(txn.client, txn.req.redirectURI, txn.user, scope, issued);
      }
    } catch (ex) {
      return next(ex);
    }
  }


  /**
   * Return `code` approval module.
   */
  var mod = {};
  mod.name = 'code';
  mod.request = request;
  mod.response = response;
  mod.responseType = 'code';
  return mod;
};
