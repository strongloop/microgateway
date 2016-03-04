/*
 * Executes the assembly flow
 */
'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:assembly'});

var paramResolver = require('./apim-param-resolver');
var FlowCtor = require('flow-engine').Flow;

module.exports = function createAssemblyMiddleware(options) {
  logger.debug('configuration', options);
  var policies = options.policies || {};

  return function assembly(req, res, next) {
    var ctx = req.ctx;
    // if there is no assembly defined, skip the flow-engine
    if (ctx === undefined || ctx.get('_.api.assembly') === undefined) {
      logger.debug('Skip ' + req.originalUrl + ' non-apim traffics');
      next();
      return;
    }

    var assembly = ctx.get('_.api.assembly');
    logger.debug('assembly flow: %j', assembly);

    var options = { tasks : policies,
            paramResolver : paramResolver,
            context : ctx,
            tid : ctx.get('request.tid')
        };

    var flow = new FlowCtor(assembly, options);
    flow.prepare(ctx, next);
    flow.run();
  };
};

