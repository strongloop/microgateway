// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

/*
 * Creates the APIm context object and populate context variables
 * with values from the req object
 */
'use strict';

//
// third-party module dependencies
//
var flow = require('flow-engine');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:context' });

//
// internal module dependencies
//

module.exports = function createContextMiddleware(options) {
  logger.debug('context middleware options:', options);

  options = options || {};

  var populateMessageVariables =
          require('./lib/populate-message-variables.js')(options.message);
  var populateRequestVariables =
          require('./lib/populate-request-variables.js')(options.request);
  var populateSystemVariables =
          require('./lib/populate-system-variables.js')(options.system);

  return function(req, res, next) {
    // create the APIm context used for the following middlewares
    try {
      var ctx = req.ctx || flow.createContext();
      req.ctx = ctx;
      // assign tid into 'request.tid'
      ctx.set('request.tid', flow.tid(), true);

      populateRequestVariables(ctx, req, function(error) {
        if (error) {
          next(error);
        } else {
          populateSystemVariables(ctx);
          populateMessageVariables(ctx, req);
          next();
        }
      });
    } catch (error) {
      next(error);
    }
  };
};

