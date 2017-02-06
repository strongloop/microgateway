// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0


'use strict';

module.exports = function(config) {

  return function(props, context, flow) {
    var error = {
      name: (props.name ? props.name + '' : 'ThrowError'),
      message: (props.message ? props.message + '' : undefined),
    };

    var logger = flow.logger;
    logger.error('[throw] throwing %j', error);
    flow.fail(error);
  };
};
