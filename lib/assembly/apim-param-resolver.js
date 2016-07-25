// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*
 *  This module provides function to replace APIm context
 *  variables (syntax: $(varname)) configured on a policy
 *  with the actual context variable value.
 *
 *  For example,
 *  - invoke:
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
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:assembly:apim-param-resolver' });
var _ = require('lodash');

module.exports = function(context, name, value) {
  if (_.isString(value)) {
    var matchCount = 0;
    var matchName;
    var newValue = value.replace(/\$\(([^)]+)\)/gm, function(m, g1) {
      matchCount++;
      matchName = g1;
      return context.get(g1);
    });
    // if the pattern is '$(the-variable-name)'
    // return the original value of the referenced context variable
    // instead of returning a string value
    if (matchCount === 1 && value.match(/^\$\(.+\)$/)) {
      newValue = context.get(matchName);
    }
    logger.debug('replace parameter "' + name + '": "' + value + '" with "' + newValue + '"');
    return newValue;
  } else {
    return value;
  }
};

