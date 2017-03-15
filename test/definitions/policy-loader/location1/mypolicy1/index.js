// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var assert = require('assert');

module.exports = function(config) {
  return function(props, context, next) {
    context.policyName = 'mypolicy1';
    assert(config.settings.foo === 'bar');
    next();
  };
};
