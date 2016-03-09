/*
 * Populate the final response with the context.message
 */
'use strict';
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:postflow'});

module.exports = function createPostFlowMiddleware(options) {
  return function postflow(req, res, next) {
    logger.debug("In the postflow, prepare the final response");
    req.ctx.notify('post-flow', function(errors) {
      try {
        var msg = req.ctx.get('message');
        res.statusCode = msg.statusCode ? msg.statusCode : 200;
        res.statusMessage = msg.reasonPhrase;
        var body = msg.body;
        if (body && !_.isString(body) && !_.isBuffer(body))
            body = JSON.stringify(body);

        var chunked = false;
        if (msg.headers) {
          res.set(msg.headers);

          // Check if chunked mode is set
          if (msg.headers['Transfer-Encoding'] === 'chunked' ||
            msg.headers['transfer-encoding'] === 'chunked') {
            chunked = true;
          }
        }

        if (!chunked) {
          if (body) {
            res.set('Content-Length', body.length);
          } else {
            res.set('Content-Length', 0);
          }
        }

        // Update X-Powered-By
        res.setHeader('X-Powered-By', 'IBM API Connect MicroGateway');

        if (body)
          res.write(body);
        
        res.end();

        next();
      }
      catch (error) {
        logger.debug("Cannot read context.message in the postflow: " + error);
        next(error);
      }
    });
  }
};

