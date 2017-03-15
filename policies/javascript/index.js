// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';
var vm = require('vm');
var _ = require('lodash');

function consoleProxy(log) {
  // Create a console API proxy around Bunyan-based flow logger

  /*
   logger.fatal()
   logger.error()
   logger.warn()
   logger.info()
   logger.debug()
   logger.trace()
   */

  // function fatal() {
  //  log.fatal.apply(log, arguments);
  // }

  function error() {
    log.error.apply(log, arguments);
  }

  function warn() {
    log.warn.apply(log, arguments);
  }

  function info() {
    log.info.apply(log, arguments);
  }

  // function debug() {
  //  log.debug.apply(log, arguments);
  // }

  function trace() {
    log.debug.apply(log, arguments);
  }

  return {
    // fatal: fatal,
    error: error,
    warn: warn,
    log: info,
    info: info,
    // debug: debug,
    trace: trace };
}

module.exports = function(config) {
  var javascriptPolicyHandler = function(props, context, flow) {
    var logger = flow.logger;
    logger.debug('ENTER javascript policy');

    if (_.isUndefined(props.source) || !_.isString(props.source)) {
      flow.fail({ name: 'JavaScriptError', value: 'Invalid JavaScript code' });
      return;
    }
    // need to wrap the code snippet into a function first
    try {
      var script = new vm.Script('(function() {' + props.source + '\n})()');
      // use context as this to run the wrapped function
      // and also console for logging
      var origProto = Object.getPrototypeOf(context);
      var newProto = Object.create(origProto);
      newProto.console = consoleProxy(flow.logger);
      Object.setPrototypeOf(context, newProto);
      script.runInNewContext(context);
      Object.setPrototypeOf(context, origProto);
      logger.debug('EXIT');
      flow.proceed();
    } catch (e) {
      logger.debug('EXIT with an error:%s', e);
      if (e.name) {
        flow.fail(e);
      } else {
        flow.fail({ name: 'JavaScriptError', message: '' + e });
      }
    }
  };
  // disable param resolving
  javascriptPolicyHandler.skipParamResolving = true;
  return javascriptPolicyHandler;
};
