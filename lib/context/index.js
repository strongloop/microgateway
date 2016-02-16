/*
 * Creates the APIm context object and populate context variables
 * with values from the req object
 */
'use strict';

//
// third-party module dependencies
//
var createContext = require('flow-engine').createContext;
var debug = require('debug')('strong-gateway:context');

//
// internal module dependencies
//


module.exports = function createContextMiddleware(options) {
  debug('configuration', options);

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
      var ctx = req.ctx;
      if (!ctx) {
        ctx = createContext();
        req.ctx = ctx;
      }

      ctx.req = req;
      ctx.res = res;

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


