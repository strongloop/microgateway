'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:policies:cors'});
module.exports = function(config) {
  return function(props, ctx, flow) {
    flow.subscribe('FINISH', (event, next) => {
      let allowCreds = props['allow-credentials'];
      if (allowCreds === true) {
        ctx.message.headers['Access-Control-Allow-Credentials'] = 'true';
      }
      let allowHeaders = props['allow-headers'];
      if (allowHeaders) {
        ctx.message.headers['Access-Control-Allow-Headers'] = allowHeaders;
      }
      let allowMethods = props['allow-methods'];
      if (allowMethods) {
        ctx.message.headers['Access-Control-Allow-Methods'] = allowMethods;
      }
      let allowOrigin = props['allow-origin'];
      if (allowOrigin) {
        ctx.message.headers['Access-Control-Allow-Origin'] = allowOrigin;
      }
      let exposeHeaders = props['expose-headers'];
      if (exposeHeaders) {
        ctx.message.headers['Access-Control-Expose-Headers'] = exposeHeaders;
      }
      let maxAge = props['max-age'];
      if (maxAge) {
        ctx.message.headers['Access-Control-Max-Age'] = maxAge.toString();
      }
      next();
    });
    flow.proceed();
  };
};
