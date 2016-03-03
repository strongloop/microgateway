'use strict';
const vm    = require('vm');
const _     = require('lodash');
var logger = require('../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:policies:javascript'});

module.exports = function(config) {
  return function(props, context, next) {
    logger.debug('ENTER JavaScript');
    if (_.isUndefined(props.source) || !_.isString(props.source)) {
      next({name:'JavaScriptError', value: 'Invalid JavaScript code'});
      return;
    }
    //need to wrap the code snippet into a function first
    var script = new vm.Script('() => {' + props.source + '}()');
    try {
      //use context as this to run the wrapped function
      script.runInNewContext(context);
      logger.debug('EXIT');
      next();
    } catch (e) {
      logger.debug('EXIT with an error:%s', e);
      if ( e.name ) {
        next(e);
      } else {
        next({name: 'JavaScriptError', value: '' + e});
      }
    }
  };
};
