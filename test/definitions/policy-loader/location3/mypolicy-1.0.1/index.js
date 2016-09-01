// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';

module.exports = function(config) {
  return function(props, context, flow) {
    context.set('message.headers.x-policy-101', 'true');
    flow.proceed();
  };
};
