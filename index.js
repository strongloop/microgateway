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
var populateMessageVariables = require('./lib/populate-message-variables.js')();
var populateRequestVariables = require('./lib/populate-request-variables.js')();
var populateSystemVariables  = require('./lib/populate-system-variables.js')();


module.exports = function createContextMiddleware(options) {
  debug('configuration', options);

  options = options || {};

  return function(req, res, next) {
    // create the APIm context used for the following middlewares
    var ctx = createContext('apim');
    req.ctx = ctx;

    ctx.req = req;
    ctx.res = res;

    populateRequestVariables(ctx, req);
    populateSystemVariables(ctx);
    populateMessageVariables(ctx, req, function(error) {
      next(error);
    });
  };
};


