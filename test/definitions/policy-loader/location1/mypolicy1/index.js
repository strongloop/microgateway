'use strict';

module.exports = function(config) {
    return function(props, context, next) {
        context.policyName = 'mypolicy1';
        next();
    }
};