// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var BadRequestError = require('../../errors/badrequesterror');
var ForbiddenError = require('../../errors/forbiddenerror');

/**
 * Loads an OAuth 2.0 authorization transaction from the session.
 *
 * This middleware is used to load a pending OAuth 2.0 transaction that is
 * serialized into the session.  In most circumstances, this is transparently
 * done prior to processing a user's decision with `decision` middleware, and an
 * implementation shouldn't need to mount this middleware explicitly.
 *
 * Options:
 *
 *     transactionField  name of field that contains the transaction ID (default: 'transaction_id')
 *     sessionKey        key under which transactions are stored in the session (default: 'authorize')
 *
 * @param {Server} server
 * @param {Object} options
 * @return {Function}
 * @api protected
 */
module.exports = function(server, options) {
  options = options || {};

  if (!server) {
    throw new TypeError(
            'oauth2orize.transactionLoader middleware requires a server argument');
  }

  var field = options.transactionField || 'transaction_id';
  var key = options.sessionKey || 'authorize';

  return function transactionLoader(req, res, next) {
    if (!req.session) {
      return next(new Error(
                  'OAuth2orize requires session support. Did you forget app.use(express.session(...))?'));
    }

    if (!req.session[key]) {
      req.ctx.set('error.status.code', 403);
      return next(new ForbiddenError(
                  'Unable to load OAuth 2.0 transactions from session'));
    }

    var query = req.query || req.ctx.request.parameters || {};
    var body = req.ctx.request.body || {};
    var tid = query[field] || body[field];

    if (!tid) {
      req.ctx.set('error.status.code', 400);
      return next(new BadRequestError(
                  'Missing required parameter: ' + field));
    }

    var txn = req.session[key][tid];
    if (!txn) {
      req.ctx.set('error.status.code', 403);
      return next(new ForbiddenError(
                  'Unable to load OAuth 2.0 transaction: ' + tid));
    }

    if (typeof req.oauth2 === 'object') {
      _.extend(txn, req.oauth2);
    }
    req.oauth2 = txn;

    next();
  };
};
