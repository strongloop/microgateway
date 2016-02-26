'use strict';

module.exports = function(config) {
    return function(props, context, next) {
        context.policyName = 'mypolicy3';
        next();
    }
};