// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

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
