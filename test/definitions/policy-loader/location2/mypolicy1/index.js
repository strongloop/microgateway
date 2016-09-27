// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';
var assert = require('assert');

module.exports = function(config) {
  return function(props, context, next) {
    context.policyName = 'mypolicy1a';
    assert(config.settings.foo === 'bar2');
    next();
  };
};
