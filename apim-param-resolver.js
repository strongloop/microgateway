/*
 *  APIm assembly YAML placeholder replacement
 */
'use strict';
var debug = require('debug')('strong-gateway:apim-param-resolver');
var util = require('util');

module.exports = function(context, name, value) {
  if (util.isString(value)) {
    let newValue = value.replace(/\$\(([^)]+)\)/gm, function(m, g1) {
        return context.get(g1);
    }); 
    debug('replace parameter "'+name+'": "'+value+'" with "'+ newValue + '"');
    return newValue;
  } else {
    return value;
  }
};  

