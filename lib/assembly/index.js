// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

/*
 * Executes the assembly flow
 */
'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:assembly' });

var paramResolver = require('./apim-param-resolver');
var FlowCtor = require('flow-engine').Flow;

module.exports = function createAssemblyMiddleware(options) {
  logger.debug('configuration', options);
  var policies = options.policies || {};

  return function assembly(req, res, next) {
    var ctx = req.ctx;
    var _ = require('lodash');
    // if there is no assembly defined, skip the flow-engine
    if (ctx === undefined || ctx.get('_.api.assembly') === undefined ||
        _.isEmpty(ctx.get('_.api.assembly').assembly)) {
      if (logger.debug()) {
        logger.debug('Skip ' + maskQueryStringInURL(req.url) + ' non-apim traffics');
      }
      next();
      return;
    }

    var assembly = ctx.get('_.api.assembly');
    logger.debug('assembly flow: %j', assembly);

    var options = {
      tasks: policies,
      paramResolver: paramResolver,
      context: ctx,
      tid: ctx.get('request.tid'),
      logger: require('apiconnect-cli-logger/logger.js')
          .child({ tid: ctx.get('request.tid'), loc: 'microgateway:flow-engine' }) };

    var flow = new FlowCtor(assembly, options);
    flow.prepare(ctx, next);
    flow.run();
  };
};

function maskQueryStringInURL(url) {
  url = url || '';
  return url.replace(/\?.*?$/, '');
};
