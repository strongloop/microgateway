// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var helpers = require('../../oauth2-helper');
var AuthorizationError = require('../../errors/authorizationerror');

/**
 * Handle authorization requests from OAuth 2.0 clients.
 *
 * Obtaining authorization via OAuth 2.0 consists of a sequence of discrete
 * steps.  First, the client requests authorization from the user (in this case
 * using an authorization server as an intermediary).  The authorization server
 * conducts an approval dialog with the user to obtain permission.  After access
 * has been allowed, a grant is issued to the client which can be exchanged for
 * an access token.
 *
 * This middleware is used to initiate authorization transactions.  If a request
 * is parsed and validated, the following properties will be available on the
 * request:
 *
 *     req.oauth2.transactionID  an ID assigned to this transaction
 *     req.oauth2.client         client requesting the user's authorization
 *     req.oauth2.redirectURI    URL to redirect the user to after authorization
 *     req.oauth2.req            parameters from request made by the client
 *
 * The contents of `req.oauth2.req` depends on the grant type requested by the
 * the client.  The `server`'s request parsing functions are used to construct
 * this object, and the application can implement support for these types as
 * necessary, taking advantage of bundled grant middleware.
 *
 * Because the approval dialog may be conducted over a series of requests and
 * responses, a transaction is also stored in the session until a decision is
 * reached.  The application is responsible for verifying the user's identity
 * and prompting him or her to allow or deny the request (typically via an HTML
 * form).  At that point, `decision` middleware can be utilized to process the
 * user's decision and issue the grant to the client.
 *
 * Callbacks:
 *
 * This middleware requires a `validate` callback, for which the function
 * signature is as follows:
 *
 *     function(clientID, redirectURI, done) { ... }
 *
 * `clientID` is the client identifier and `redirectURI` is the redirect URI as
 * indicated by the client.  If the request is valid, `done` must be invoked
 * with the following signature:
 *
 *     done(err, client, redirectURI);
 *
 * `client` is the client instance which is making the request.  `redirectURI`
 * is the URL to which the user will be redirected after authorization is
 * obtained (which may be different, if the server is enforcing registration
 * requirements).  If an error occurs, `done` should be invoked with `err` set
 * in idomatic Node.js fashion.
 *
 * Alternate function signatures of the `validate` callback are available if
 * needed.  Consult the source code for a definitive reference.
 *
 *
 * Note that authorization may be obtained by the client directly from the user
 * without using an authorization server as an intermediary (for example, when
 * obtaining a grant in the form of the user's password credentials).  In these
 * cases, the client interacts only with the token endpoint without any need to
 * interact with the authorization endpoint.
 *
 * Options:
 *
 *     idLength    length of generated transaction IDs (default: 8)
 *     sessionKey  key under which transactions are stored in the session (default: 'authorize')
 *
 * Examples:
 *
 *     app.get('/dialog/authorize',
 *       login.ensureLoggedIn(),
 *       server.authorization(function(clientID, redirectURI, done) {
 *         Clients.findOne(clientID, function(err, client) {
 *           if (err) { return done(err); }
 *           if (!client) { return done(null, false); }
 *           return done(null, client, client.redirectURI);
 *         });
 *       }),
 *       function(req, res) {
 *         res.render('dialog', { transactionID: req.oauth2.transactionID,
 *                                user: req.user, client: req.oauth2.client });
 *       });
 *
 * References:
 *  - [Authorization Endpoint](http://tools.ietf.org/html/draft-ietf-oauth-v2-28#section-3.1)
 *
 * @param {Server} server
 * @param {Object} options
 * @param {Function} validate
 * @return {Function}
 * @api protected
 */
module.exports = function(server, options, validate) {
  if (typeof options === 'function') {
    validate = options;
    options = undefined;
  }
  options = options || {};

  if (!server) {
    throw new TypeError(
            'oauth2orize.authorization middleware requires a server argument');
  }
  if (!validate) {
    throw new TypeError(
            'oauth2orize.authorization middleware requires a validate function');
  }

  var key = options.sessionKey || 'authorize';

  return function authorization(req, res, next) {
    if (!req.session) {
      return next(new Error('OAuth2orize requires session support.' +
        ' Did you forget app.use(express.session(...))?'));
    }

    var body = req.body || {};
    var type = req.query.response_type || body.response_type;

    server._parse(type, req, function(err, areq) {
      if (err) {
        return next(err);
      }

      if (!areq || !Object.keys(areq).length) {
        return next(new AuthorizationError(
                    'Missing required parameter "response_type"',
                    'invalid_request'));
      }

      var clientID = areq.clientID || req.query.client_id || body.client_id;

      if (_.isUndefined(clientID) || clientID === '') {
        //this won't be reached. If no client_id,
        //then preflow fails the request as 404
        return next(new AuthorizationError(
                    'Missing client_id',
                    'invalid_request'));
      }

      function validated(err, client) {
        if (err) {
          return next(err);
        }

        var redirectURI = areq.redirectURI ||
                          req.query.redirect_uri ||
                          body.redirect_uri ||
                          client['oauth-redirection-uri'];

        if (!redirectURI) {
          return next(new AuthorizationError(
                      'Invalid request: missing redirect_uri',
                      'invalid_request'));
        }

        if (helpers.validateClient(client, server,
            { redirectURI: redirectURI }, next)) {
          return;
        }

        req.oauth2.redirectURI = redirectURI;

        if (Object.keys(areq).length === 1 && areq.type) {
          return next(new AuthorizationError(
                      'Unsupported response type "' + type + '"',
                      'unauthorized_client'));
        }

        //verify responseType and scope here
        //TODO: since the scope is a required parameter in APIC
        //if the scope === undefined here, reassign it as empty to
        //fail the check
        if (helpers.validateClient(
                client,
                server,
                { responseType: areq.type, scope: areq.scope || '' },
                next)) {
          return;
        }

        //restore data from session
        var txns = req.session[key] = req.session[key] || {};
        var txn = helpers.searchTXData(txns, areq) || helpers.createTXData(txns, areq, client);

        if (typeof req.oauth2 === 'object') {
          _.extend(txn, req.oauth2);
        }
        req.oauth2 = txn;

        next();
      }

      try {
        //call validate to retrieve the client data and get back to
        //validated function above
        validate(req.ctx, clientID, validated);
      } catch (ex) {
        return next(ex);
      }
    });
  };
};
