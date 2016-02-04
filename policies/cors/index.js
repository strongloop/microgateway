'use strict';
var debug = require('debug')('policy:cors');

module.exports = function (props) {
    return function (context, next ) {
      debug('ENTER cors');
      console.log('do some cors stuff');
      next();
    }
}
