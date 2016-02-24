/*
 * Executes the assembly flow
 */
'use strict';
var debug = require('debug')('micro-gateway:assembly');

var paramResolver = require('./apim-param-resolver');
var FlowCtor = require('flow-engine').Flow;

module.exports = function createAssemblyMiddleware(options) {
  debug('configuration', options);
  var policies = options.policies || {};

  return function assembly(req, res, next) {
    var ctx = req.ctx;
    // if there is no assembly defined, skip the flow-engine
    if (ctx === undefined || ctx.get('_.api.assembly') === undefined) {
      debug('Skip ' + req.originalUrl + ' non-apim traffics');
      next();
      return;
    }

    var assembly = ctx.get('_.api.assembly');
    debug('assembly flow: %j', assembly);

    var options = { tasks : policies };
    options.paramResolver = paramResolver;
    options.context = ctx;

    var flow = new FlowCtor(assembly, options);
    flow.prepare(ctx, next);
    flow.run();
  };
};

