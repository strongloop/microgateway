'use strict';
var debug = require('debug')('policy:apim-noop');

// This code has a blatant disregard for errors that may happen...

module.exports = function (props) {
    return function (context, next ) {
      debug('ENTER apim-noop');
      console.log('ENTER apim-noop');
      next();
    }
}
