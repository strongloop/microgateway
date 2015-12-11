/*
 * Populate APIm context and determine the API swagger based
 * on the clientID, http method, and URI
 */
'use strict';
var debug = require('debug')('strong-gateway:preflow');

module.exports = function createPreflowMiddleware(options) {
  debug('configuration', options);
  
  // TODO - assembly is currently hardcoded. 
  // To be replaced with file or Jon's config-mgmt model

  return function preflow(req, res, next) {
    // if the URL doesn't being with /apim, then skip the preflow
    // the reason is not to break existing StrongGateway's test cases
    if (req.originalUrl.search(/^\/apim\//) === -1) {
      debug('Skip ' + req.originalUrl + ' non-apim traffics');
      next();
      return;
    }

    let ctx = req.ctx;

    let assembly = 
        'assembly:\n' +
        '  execute:\n' +
        '    - invoke-api:\n' +
        '        target-url: "http://$(target-host)/$(request.path)"\n'+
        '        verb: $(request.verb)\n';

    ctx.set('flowAssembly', require('yamljs').parse(assembly));
    ctx.set('target-host', 'localhost:8889');
    ctx.set('request.path', req.originalUrl);
    ctx.set('request.verb', req.method);
    next();
  };
};

