'use strict';

module.exports = function(config) {
    return function(props, context, next) {
        context.policyName = 'mypolicy4';
        next();
    }
};