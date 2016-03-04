'use strict';
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:policies:set-variable'});

module.exports = function(config) {
  return function(props, context, flow) {
    var hasError = props.actions.some(function(action) {
        if (action.hasOwnProperty('set')) {
            logger.debug('set ' + action.set + '=' + action.value);
            context.set(action.set, action.value);
        } else if (action.hasOwnProperty('add')) {
            logger.debug('add ' + action.add + '=' + action.value);
            var value = context.get(action.add);
            if (_.isNil(value))
                value = _.concat([], action.value);
            else if (_.isArray(value))
                value = _.concat(value, action.value);
            else
                value = _.concat([], value, action.value);
            context.set(action.add, value);
        } else if (action.hasOwnProperty('clear')) {
            logger.debug('clear ' + action.clear);
            context.set(action.clear, '');
        } else {
            var error = {
                name: 'SetVariableError',
                value: action,
                message: 
                    'Action not provided in set-variable policy, ' +
                    'valid actions: set, add, and clear.',
            };
            flow.fail(error);
            return true;
        }
    });
    if (!hasError)
        flow.proceed();
  };
};
