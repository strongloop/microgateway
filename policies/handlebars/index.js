// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var Handlebars = require('handlebars');
var _ = require('lodash');

module.exports = function(config) {
  var handlebarsPolicyHandler = function(props, context, flow) {
    var logger = flow.logger;
    logger.debug('ENTER handlebars policy');

    if (_.isUndefined(props.source) || !_.isString(props.source)) {
      flow.fail({name:'HandlebarsError', value: 'Missing Handlebars template'});
      return;
    }
    if (props.output && !_.isString(props.output)) {
      flow.fail({name:'HandlebarsError', value: 'Invalid output'});
      return;
    }
    var output = "message.body";
    if (props.output) {
      output = props.output;
    }
    var templateFn;
    try {
      templateFn = Handlebars.compile(props.source);
      context.set(output, templateFn(context));
    } catch (e) {
      flow.fail({name:'HandlebarsError', value: 'Invalid Handlebars template'});
      return;
    }
    logger.debug('EXIT');
    flow.proceed();
  };
  return handlebarsPolicyHandler;
};
