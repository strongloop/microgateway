'use strict';
var debug = require('debug')('policy:redaction');
module.exports = function(config) {
  return function(props, context, next) {
    debug('ENTER redaction');
    console.log('ENTER redaction');
    next();
  };
};
