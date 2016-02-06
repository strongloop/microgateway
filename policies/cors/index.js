'use strict';
var debug = require('debug')('policy:cors');
module.exports = function(config) {
  return function(props, context, next) {
    debug('ENTER cors');
    console.log('do some cors stuff');
    next();
  };
};
