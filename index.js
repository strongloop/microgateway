/*
 * Populate APIm context and determine the API swagger based
 * on the clientID, http method, and URI
 */
'use strict';
var debug = require('debug')('strong-gateway:preflow');
var apimlookup = require('./apim-lookup');
var contextget = apimlookup.contextget;

/**
 * This function populates APIm context variables with data from
 * the request object and the API definitions.
 *
 * @param req the request object from the wire
 * @param ctx the APIm context object
 * @param apis an array of API swagger definition objects
 *
 */
function populateAPImCtx(req, ctx, apis) {
  if (apis.length === 1) {
    ctx.set('flowAssembly', apis[0].flow);
    ctx.set('target-host', 'http://9.42.102.139:3030'); // TODO: real env
    ctx.set('request.path', req.originalUrl);           // TODO: real env
    ctx.set('request.verb', req.method);                // TODO: real env

    ctx.set('api', apis[0].context.api);
    ctx.set('plan', apis[0].context.plan);
    ctx.set('client', apis[0].context.client);
  } else if (apis.length === 0) {
    // TODO: Do something here to indicate a 404
    debug('No APIs found');
  } else {
    debug('Multiple API matches found: ', apis.length);
    // More than one matching API was returned, get the right one, these
    // headers may help
    //X-IBM-Plan-Id
    //X-IBM-Plan-Version
    //X-IBM-Api-Version
    var planId = req.headers['x-ibm-plan-id'];
    // TODO Thomas and Jeremy, do we need to check plan version?
    // apis[i].context.plan.version === planVersion
    // var planVersion = req.headers['x-ibm-plan-version'];
    var matchFound = false;
    for (var i=0; i < apis.length; i++) {
      if (apis[i].context.plan.planId === planId) {
        // TODO Thomas and Jeremy, do we need to check plan version?
        // apis[i].context.plan.version === planVersion
        ctx.set('flowAssembly', apis[i].flow);
        ctx.set('target-host', 'http://9.42.102.139:3030'); // TODO: real env
        ctx.set('request.path', req.originalUrl);           // TODO: real env
        ctx.set('request.verb', req.method);                // TODO: real env

        ctx.set('api', apis[i].context.api);
        ctx.set('plan', apis[i].context.plan);
        ctx.set('client', apis[i].context.client);
        matchFound = true;
        break;
      }
    }
    if (matchFound === false) {
      // TODO: Do something here to indicate a 404
      debug('No APIs found based on header match');
    }
  }
}

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

    // Retrieve the clientId from url param or header and place it in context
    fetchClientId(req);

    var ctx = req.ctx;

//    var assembly =
//        'assembly:\n' +
//        '  execute:\n' +
//        '    - invoke:\n' +
//        '        target-url: "http://$(target-host)/$(request.path)"\n'+
//        '        verb: $(request.verb)\n';
//
//    ctx.set('flowAssembly', require('yamljs').parse(assembly));
//    ctx.set('target-host', 'http://9.42.102.139:3030');
//    ctx.set('request.path', req.originalUrl);
//    ctx.set('request.verb', req.method);
    debug('Use apim-lookup()');
    var contextgetOptions = {};
    contextgetOptions['path'] = req.originalUrl;
    contextgetOptions['method'] = req.method;
    contextgetOptions['clientid'] = ctx.get('client-id');

    // TODO what if contextget gives error, ex: network error ?
    //      first param of contextget callback should be error
    contextget(contextgetOptions, function(error, apis) {
       if (error) {
           // there was an error with the contextget
           debug('contextget: ', error, apis);
       } else {
           if (apis !== undefined) {
               populateAPImCtx(req, ctx, apis);
           }
       }
       next();
    });

  };
};

/**
 * Function that retrieves the client ID from either the request headers or the
 * URL query parameters
 */
function fetchClientId(req) {
  var ctx = req.ctx;

  var clientId = req.query['client_id'];
  debug('Query Client Id: ' + clientId);
  if (!clientId) {
    clientId = req.headers['x-ibm-client-id'];
    debug('Header Client Id: ' + clientId);
  }

  ctx.set('client-id', clientId);
}
