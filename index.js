/*
 * Executes the assembly flow
 */
'use strict';
var debug = require('debug')('strong-gateway:assembly');

var paramResolver = require('./apim-param-resolver');

module.exports = function createAssemblyMiddleware(options) {
  debug('configuration', options);

  return function assembly(req, res, next) {
    let ctx = req.ctx;
    
    // if there is no assembly defined, skip the flow-engine
    if (ctx === undefined || ctx.get('flowAssembly') === undefined) {
      next();
    }
    
    debug('ctx.flowAssembly: ' + 
            JSON.stringify(ctx.get('flowAssembly'), undefined, 2));

    const FlowCtor = require('flow-engine').Flow;
    let options = {};
    options.paramResolver = paramResolver;
    options.ctxScope = 'apim';

    let flow = new FlowCtor(ctx.get('flowAssembly'), options);
    flow.prepare(req, res, next);
    flow.run();
  };
};

