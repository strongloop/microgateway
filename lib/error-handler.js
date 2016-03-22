// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:error-handler'});

module.exports = function createErrorHandler(options) {

  return function errorHandler(err, req, res, next) {
    if (logger.debug()) {
      logger.debug('Error Handler: %j', err)
    }

    var code = 500;
    var reason = undefined;
    var ctxerr = req.ctx.error;
    if (!_.isNil(ctxerr)) {
      if (!_.isNil(ctxerr.status)) {
        code = ctxerr.status.code || 500;
        reason = ctxerr.status.reason
      }
      if (ctxerr.headers)
        res.set(ctxerr.headers);
    }
    res.status(code);
    res.statusMessage = reason;

    // Update X-Powered-By
    res.setHeader('X-Powered-By', 'IBM API Connect MicroGateway');

    // if the error conform to micro-gw's error format, return directly
    if (err instanceof Error || (_.isPlainObject(err) && err.name)) {
        res.send(err);
    } else {
        res.send({name: "GatewayError", message: "Internal Server Error"});
    }
  };
};

