// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

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
      //assign tid into 'request.tid'
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

