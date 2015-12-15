/*
 * Creates the APIm context object
 */
'use strict';

var debug = require('debug')('strong-gateway:context');

var extend = require('util')._extend;
var createContext = require('flow-engine').createContext;

module.exports = function createContextMiddleware(options) {
  debug('configuration', options);

  options = extend(Object.create(null), options);

  return function(req, res, next) {
    // TODO context should be an independent module
    // create the APIm context used for the following middlewares
    var ctx = createContext('apim');
    ctx.req = req;
    ctx.res = res;

    req.ctx = ctx;

    next();
  };
};

