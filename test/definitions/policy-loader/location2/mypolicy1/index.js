'use strict';
const assert = require('assert');

module.exports = function(config) {
    return function(props, context, next) {
        context.policyName = 'mypolicy1a';
        assert(config.settings.foo === 'bar2');
        next();
    }
};