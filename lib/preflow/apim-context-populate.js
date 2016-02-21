// populate the APIm context variables

'use strict';

//
// third-party module dependencies
//
var url = require('url');


/**
 * @param {Object} api the API object of this request
 * @param {Object} ctx the context object
 * @param {Object} req the express request object
 *
 * @returns the updated context object
 */
module.exports = function populateAPImCtx(api, ctx, req) {
  // _ denotes internal variables
  ctx.set('_.assembly', api.flow);
  ctx.set('_.api', api.context._);

  ctx.set('config-snapshot-id', api.context.snapshot);
  ctx.set('api', api.context.api);
  ctx.set('plan', api.context.plan);
  ctx.set('client', api.context.client);

  // set api.endpoint variables
  ctx.define('api.endpoint.address', function() {
    return req.socket.address().address;  	
  }, false);

  ctx.define('api.endpoint.hostname', function() {
    return url.parse('//' + req.get('host'), false, true).hostname;
  });

  return ctx;
};
