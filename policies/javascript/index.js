'use strict';
const vm    = require('vm');
const _     = require('lodash');
const debug = require('debug')('policy:javascript');

module.exports = function(config) {
  return function(props, context, next) {
    debug('ENTER JavaScript');
    if (_.isUndefined(props.source) || !_.isString(props.source)) {
      next({name:'JavaScriptError', value: 'Invalid JavaScript code'});
      return;
    }
    //need to wrap the code snippet into a function first
    var script = new vm.Script('() => {' + props.source + '}()');
    try {
      //use context as this to run the wrapped function
      script.runInNewContext(context);
      debug('EXIT');
      next();
    } catch (e) {
      debug('EXIT with an error:%s', e);
      if ( e.name ) {
        next(e);
      } else {
        next({name: 'JavaScriptError', value: '' + e});
      }
    }
  };
};
