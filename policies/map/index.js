'use strict';
var debug = require('debug')('policy:map');
module.exports = function(config) {
  return function(props, context, next) {
    debug('ENTER map');
    console.log('do some map stuff');
    next();
  };
};
