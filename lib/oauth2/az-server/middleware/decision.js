// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var ForbiddenError = require('../../errors/forbiddenerror');


/**
 * Handle authorization decisions from resource owners.
 *
 * Obtaining authorization via OAuth 2.0 consists of a sequence of discrete
 * steps.  First, the client requests authorization from the user (in this case
 * using an authorization server as an intermediary).  The authorization server
 * conducts an approval dialog with the user to obtain permission.  After access
 * has been allowed, a grant is issued to the client which can be exchanged for
 * an access token.
 *
 * This middleware is used to process a user's decision about whether to allow
 * or deny access.  The client that initiated the authorization transaction will
 * be sent a response, including a grant if access was allowed.
 *
 * The exact form of the grant will depend on the type requested by the client.
 * The `server`'s response handling functions are used to issue the grant and
 * send the response.   An application can implement support for these types as
 * necessary, including taking advantage of bundled grant middleware.
 *
 * Callbacks:
 *
 * An optional `parse` callback can be passed as an argument, for which the
 * function signature is as follows:
 *
 *     function(req, done) { ... }
 *
 * `req` is the request, which can be parsed for any additional parameters found
 * in query as required by the service provider.  `done` is a callback which
 * must be invoked with the following signature:
 *
 *     done(err, params);
 *
 * `params` are the additional parameters parsed from the request.  These will
 * be set on the transaction at `req.oauth2.res`.  If an error occurs, `done`
 * should be invoked with `err` set in idomatic Node.js fashion.
 *
 * Options:
 *
 *     cancelField    name of field that is set if user denied access (default: 'cancel')
 *     userProperty   property of `req` which contains the authenticated user (default: 'user')
 *     sessionKey     key under which transactions are stored in the session (default: 'authorize')
 *
 * Examples:
 *
 *     app.post('/dialog/authorize/decision',
 *       login.ensureLoggedIn(),
 *       server.decision());
 *
 *     app.post('/dialog/authorize/decision',
 *       login.ensureLoggedIn(),
 *       server.decision(function(req, done) {
 *         return done(null, { scope: req.scope })
 *       }));
 *
 * @param {Server} server
 * @param {Object} options
 * @param {Function} parse
 * @return {Function}
 * @api protected
 */
module.exports = function(server, options) {
  options = options || {};

  if (!server) { throw new TypeError('oauth2orize.decision middleware requires a server argument'); }

  var approveField = options.approveField || 'approve';

  return function decision(req, res, next) {

    var oauth2 = req.oauth2;
    oauth2.res = {};

    var body = req.ctx.request.body;

    //double check the hiddle values before authorize the access
    if (!oauth2.user || !oauth2.user.id ||
        body['resource-owner'] !== oauth2.user.id ||
        body.redirect_uri !== oauth2.redirectURI ||
        body.scope !== oauth2.req.scope.join(' ') ||
        body.client_id !== oauth2.req.clientID) {

      req.ctx.set('error.status.code', 403);
      return next(new ForbiddenError('Invalid OAuth 2.0 transactions'));
    }

    if (body[approveField] && body[approveField] === 'true') {
      //store the aurhorized scope into ares.scope
      if (body.selectedscope && body.selectedscope.length > 0) {
        oauth2.res.scope = Array.isArray(body.selectedscope) ?
            body.selectedscope : body.selectedscope.split(' ');
      } else {
        oauth2.res.scope = body.scope.split(' ');
      }
      oauth2.res.allow = true;
    } else {
      oauth2.res.allow = false;
    }

//    // proxy end() to delete the transaction
//    var end = res.end;
//    res.end = function(chunk, encoding) {
//      delete req.session[key][tid];
//      res.end = end;
//      res.end(chunk, encoding);
//    };

    server._respond(oauth2, req.ctx, function(err) {
      if (err && err !== 'route') { return next(err); }
      return next();
    });
  };
};
