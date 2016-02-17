'use strict';
var debug = require('debug')('policy:set-variable');

module.exports = function(config) {
  return function(props, context, next) {
    props.actions.forEach(function(action) {
        if (action.hasOwnProperty('set')) {
            context.set(action.set, action.value);
        } else if (action.hasOwnProperty('add')) {
            // TODO: behavior need to be confirmed
            //       append on an array or concat to string?
        } else if (action.hasOwnProperty('clear')) {
            context.set(action.clear, '');
        } else {
            var error = {
                'name': 'property error',
                'value': 'action not provided',
                'message': 'Valid actions: set, add, and clear.'
            };
            next(error);
        }
    });
    next();
  };
};
