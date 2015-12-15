/*
 *  This module provides function to replace APIm context 
 *  variables (syntax: $(varname)) configured on a policy
 *  with the actual context variable value.
 *
 *  For example, 
 *  - invoke-api:
 *      url: "https://$(target-host)/services/climbing/$(reqest.path)
 *
 *  The url after replaced will be:
 *      url: "https://somehost/sevices/climbing/apim/stockQuote
 *
 *  if APIm context has the following two variables:
 *   - target-host: somehost
 *   - request.path: apim/stockQuote
 *
 */
'use strict';
var debug = require('debug')('strong-gateway:apim-param-resolver');
var util = require('util');

module.exports = function(context, name, value) {
  if (util.isString(value)) {
    var newValue = value.replace(/\$\(([^)]+)\)/gm, function(m, g1) {
        return context.get(g1);
    }); 
    debug('replace parameter "'+name+'": "'+value+'" with "'+ newValue + '"');
    return newValue;
  } else {
    return value;
  }
};  

