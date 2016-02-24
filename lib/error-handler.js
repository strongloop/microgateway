'use strict';
var _ = require('lodash');
var debug = require('debug')('micro-gateway:error-handler');

module.exports = function createErrorHandler(options) {

  return function errorHandler(err, req, res, next) {
    debug('Error Handler: ' + JSON.stringify(err))
    if (!_.isNil(req.ctx.error) && req.ctx.error.statusCode) {
        res.status(req.ctx.error.statusCode);
    } else  {
        res.status(500);
    }
    // if the error conform to micro-gw's error format, return directly
    if (_.isPlainObject(err) && err.name) {
        res.send(err);
    } else {
        res.send({name: "GatewayError", message: "Internal Server Error", value: err})
    }
  };
};

