/*
 * Creates the APIm context object
 */
'use strict';

var debug = require('debug')('strong-gateway:context');

var extend = require('util')._extend;

module.exports = function createContextMiddleware(options) {
  debug('configuration', options);

  options = extend(Object.create(null), options);

  return function createContext(req, res, next) {
    // TODO context should be an independent module
    req.ctx = require('flow-engine').createContext('apim');
    next();
  };
};

