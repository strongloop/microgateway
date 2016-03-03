/*
 * Populate the final response with the context.message
 */
'use strict';
var _ = require('lodash');
var debug = require('debug')('micro-gateway:post');

module.exports = function createPostFlowMiddleware(options) {
  return function postflow(req, res, next) {
    debug("In the postflow, prepare the final response");
    req.ctx.notify('post-flow', function(errors) {
      try {
        var msg = req.ctx.get('message');
        res.statusCode = msg.statusCode ? msg.statusCode : 200;
        res.statusMessage = msg.reasonPhrase;
        var body = msg.body;
        if (body && !_.isString(body) && !_.isBuffer(body))
            body = JSON.stringify(body);

        if (msg.headers) {
          // remove "Transfer-Encoding: chunked" header if exist
          if (msg.headers['Transfer-Encoding'] === 'chunked')
            req.ctx.del('message.headers.Transfer-Encoding');

          Object.keys(msg.headers).forEach(function(name) {
            res.setHeader(name, msg.headers[name]);
          });

          if (body)
            res.setHeader('Content-Length', body.length);
        }

        if (body)
          res.write(body);
        
        res.end();

        next();
      }
      catch (error) {
        debug("Cannot read context.message in the postflow: " + error);
        next(error);
      }
    });
  }
};

