// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
module.exports = function(config) {
  return function(props, ctx, flow) {

    flow.subscribe('FINISH', function(event, next) {
      var allowCreds = props['allow-credentials'];
      if (allowCreds === true) {
        ctx.message.headers['Access-Control-Allow-Credentials'] = 'true';
      }
      var allowHeaders = props['allow-headers'];
      if (allowHeaders) {
        ctx.message.headers['Access-Control-Allow-Headers'] = allowHeaders;
      }
      var allowMethods = props['allow-methods'];
      if (allowMethods) {
        ctx.message.headers['Access-Control-Allow-Methods'] = allowMethods;
      }
      var allowOrigin = props['allow-origin'];
      if (allowOrigin) {
        ctx.message.headers['Access-Control-Allow-Origin'] = allowOrigin;
      }
      var exposeHeaders = props['expose-headers'];
      if (exposeHeaders) {
        ctx.message.headers['Access-Control-Expose-Headers'] = exposeHeaders;
      }
      var maxAge = props['max-age'];
      if (maxAge) {
        ctx.message.headers['Access-Control-Max-Age'] = maxAge.toString();
      }
      next();
    });
    flow.proceed();
  };
};
