/*
 * Populate the final response with the context.message
 */
'use strict';
var debug = require('debug')('micro-gateway:post');

module.exports = function createPostFlowMiddleware(options) {
  return function postflow(req, res, next) {
    debug("In the postflow, prepare the final response");
    req.ctx.notify('post-flow', function(errors) {
      try {
        var msg = req.ctx.get('message');

        if (msg.statusCode)
            res.statusCode = msg.statusCode;
        if (msg.reasonPhrase && typeof msg.reasonPhrase === 'string')
            res.statusMessage = msg.reasonPhrase;

        if (msg.headers) {
          // remove "Transfer-Encoding: chunked" header if exist
          if (msg.headers['Transfer-Encoding'] === 'chunked')
            req.ctx.del('message.headers.Transfer-Encoding');

          res.set(msg.headers);
        }

        if (msg.body)
          res.send(msg.body);

        res.end();

        next(errors);
      }
      catch (error) {
        debug("Cannot read context.message in the postflow: " + error);
        next(error);
      }
    });
  }
};

