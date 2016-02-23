/*
 * Executes the assembly flow
 */
'use strict';
var debug = require('debug')('micro-gateway:assembly');

var paramResolver = require('./apim-param-resolver');
var FlowCtor = require('flow-engine').Flow;

const ibmExtension = 'api.document.x-ibm-configuration';

module.exports = function createAssemblyMiddleware(options) {
  debug('configuration', options);
  var policies = options.policies || {};

  return function assembly(req, res, next) {
    var ctx = req.ctx;
    // if there is no assembly defined, skip the flow-engine
    if (ctx === undefined || ctx.get(ibmExtension).assembly === undefined) {
      debug('Skip ' + req.originalUrl + ' non-apim traffics');
      next();
      return;
    }

    debug('assembly flow: %j', ctx.get(ibmExtension).assembly);

    var options = { tasks : policies };
    options.paramResolver = paramResolver;
    options.context = ctx;

    var flow = new FlowCtor(ctx.get(ibmExtension), options);
    flow.prepare(ctx, next);
    flow.run();
  };
};

