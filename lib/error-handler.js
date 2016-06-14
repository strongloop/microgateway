// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:error-handler'});

var redirectOAuthAZError = require('./oauth2/oauth2-helper').redirectError;

/**
 * Write the authorization error or token error to response
 */
function _oauth2ErrorHandler(err, req, res, next) {
  if (req.oauth2 && req.oauth2.type) {
    if (req.oauth2.type === 'token') {
      res.set(req.ctx.message.headers);

      //read the status and code from the AuthorizationError or TokenError
      res.status(err.status || 400);

      var response = { error: err.code || 'invalid_request' };
      if (err.message) {
        response.error_description = err.message;
      }
      res.send(response);

      return true;
    } else if (req.oauth2.type.startsWith('AZ')) {
      redirectOAuthAZError(req.ctx, req.oauth2, err);
      res.status(req.ctx.message.status.code);
      res.statusMessage = req.ctx.message.status.reason;
      res.set(req.ctx.message.headers);
      res.end();
      return true;
    }
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
        var isDone = _oauth2ErrorHandler(err, req, res, next);
        if (isDone)
            return next(); //skip the rest of the error handler
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
    next();
  };
};
