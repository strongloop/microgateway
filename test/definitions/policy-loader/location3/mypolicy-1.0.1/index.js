// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

module.exports = function(config) {
  return function(props, context, flow) {
    context.set('message.headers.x-policy-101', 'true');
    flow.proceed();
  };
};
