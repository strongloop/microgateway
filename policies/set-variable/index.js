// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';
var _ = require('lodash');

module.exports = function(config) {
  return function(props, context, flow) {
    var logger = flow.logger;

    var hasError = props.actions.some(function(action) {
      if (action.hasOwnProperty('set')) {
        logger.debug('set "%s" to %j', action.set, action.value);

        context.set(action.set, action.value);
      } else if (action.hasOwnProperty('add')) {
        logger.debug('add "%s" to %j', action.add, action.value);

        var value = context.get(action.add);
        if (_.isNil(value)) {
          value = _.concat([], action.value);
        } else if (_.isArray(value)) {
          value = _.concat(value, action.value);
        } else {
          value = _.concat([], value, action.value);
        }

        context.set(action.add, value);
      } else if (action.hasOwnProperty('clear')) {
        logger.debug('clear the "%s"', action.clear);

        context.del(action.clear);
      } else {
        logger.error('Action is not one of set, add, and clear.');

        var error = {
          name: 'PropertyError',
          message: 'Action is not one of set, add, and clear.' };
        flow.fail(error);
        return true;
      }
    });

    if (!hasError) {
      flow.proceed();
    }
  };
};
