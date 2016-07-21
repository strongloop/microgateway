// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var assert = require('assert');

module.exports = function(config) {
  return function(props, context, next) {
    context.policyName = 'mypolicy1';
    assert(config.settings.foo === 'bar');
    next();
  };
};
