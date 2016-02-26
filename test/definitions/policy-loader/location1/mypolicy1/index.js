'use strict';

const assert = require('assert');

module.exports = function(config) {
    return function(props, context, next) {
        context.policyName = 'mypolicy1';
        assert(config.settings.foo === 'bar');
        next();
    }
};