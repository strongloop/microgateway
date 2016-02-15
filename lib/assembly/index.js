/*
 * Executes the assembly flow
 */
'use strict';
var debug = require('debug')('strong-gateway:assembly');

var paramResolver = require('./apim-param-resolver');
var FlowCtor = require('flow-engine').Flow;

module.exports = function createAssemblyMiddleware(options) {
  debug('configuration', options);

  return function assembly(req, res, next) {
    var ctx = req.ctx;
    // if there is no assembly defined, skip the flow-engine
    if (ctx === undefined || ctx.get('flowAssembly') === undefined) {
      debug('Skip ' + req.originalUrl + ' non-apim traffics');
      next();
      return;
    }

    debug('ctx.flowAssembly: ' +
            JSON.stringify(ctx.get('flowAssembly'), undefined, 2));

    var options = {};
    options.paramResolver = paramResolver;
    options.context = ctx;

    var flow = new FlowCtor(ctx.get('flowAssembly'), options);
    flow.prepare(ctx, next);
    flow.run();
  };
};

