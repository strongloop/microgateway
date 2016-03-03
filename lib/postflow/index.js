/*
 * Populate the final response with the context.message
 */
'use strict';
var logger = require('../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:postflow'});

module.exports = function createPostFlowMiddleware(options) {
  return function postflow(req, res, next) {
    logger.debug("In the postflow, prepare the final response");
    try {
      var msg = req.ctx.get('message');

      res.status(msg.statusCode ? msg.statusCode : 200);


      if (msg.headers) {
        // remove "Transfer-Encoding: chunked" header if exist
        if (msg.headers['Transfer-Encoding'] === 'chunked')
          req.ctx.del('message.headers.Transfer-Encoding');
             
        res.set(msg.headers);
      }

      if (msg.body)
        res.send(msg.body);

      res.end();

      next();
    }
    catch (error) {
      logger.debug("Cannot read context.message in the postflow: " + error);
      next(error);
    }
  };
};

