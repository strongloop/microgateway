// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:error-handler'});

var AuthorizationError = require('./oauth2/errors/authorizationerror');
var TokenError = require('./oauth2/errors/tokenerror');

/**
 * Write the authorization error or token error to response
 */
function _oauth2ErrorHandler(err, req, res, next) {
  if (err instanceof AuthorizationError || err instanceof TokenError) {
      if (!err.code || !err.status) {
        logger.warn('Cannot find code or status in the OAuth2 error');
      }

      res.status(err.status || 400);
      res.setHeader('Content-Type', 'application/json;charset=UTF-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');

      var response = { error: err.code };
      if (req.ctx.request.parameters.state) {
        response.state = req.ctx.request.parameters.state; //required per spec
      }
      if (err.message) {
        response.error_description = err.message;
      }
      res.send(response);

      return true;
  }
  return false;
}

module.exports = function createErrorHandler(options) {
  return function errorHandler(err, req, res, next) {
    if (logger.debug()) {
      logger.debug('Error Handler: %j', err);
    }

    // Update X-Powered-By
    res.setHeader('X-Powered-By', 'IBM API Connect MicroGateway');

    //We need special error handling for oauth2
    if (req.ctx.api && req.ctx.api.document &&
        req.ctx.api.document['x-ibm-configuration'] &&
        req.ctx.api.document['x-ibm-configuration'].oauth2) {
        var done = _oauth2ErrorHandler(err, req, res, next);
        if (done)
            return; //skip the rest of the error handler
    }

    var code = 500;
    var reason = undefined;
    var ctxerr = req.ctx.error;
    if (!_.isNil(ctxerr)) {
      if (!_.isNil(ctxerr.status)) {
        code = ctxerr.status.code || 500;
        reason = ctxerr.status.reason;
      }
      if (ctxerr.headers)
        res.set(ctxerr.headers);
    }
    res.status(code);
    res.statusMessage = reason;

    // if the error conform to micro-gw's error format, return directly
    if (err instanceof Error || (_.isPlainObject(err) && err.name)) {
        //status code and reason phrase should not be in the message body
        res.send({name: err.name, message: err.message});
    } else {
        res.send({name: "GatewayError", message: "Internal Server Error"});
    }
  };
};
