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
function populateAPImCtx(req, res, ctx, apis) {
  var api;
  // Did we find any APIs at all?
  if (apis.length === 0) {
    res.sendStatus(404);
    debug('No APIs found');
    return null;
  }

  // If so, was the request able to authenticate for any of them?
  apis = apis.filter(_api => _api.authenticated);
  if (apis.length < 1) {
    res.sendStatus(401);
    return null;
  }

  // So far so good...
  if (apis.length === 1) {
    api = apis[0];
  }  else {
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
    for (var i = 0; i < apis.length; i++) {
      if (apis[i].context.plan.id === planId) {
        // TODO Thomas and Jeremy, do we need to check plan version?
        // apis[i].context.plan.version === planVersion
        api = apis[i];
        break;
      }
    }
    if (!api) {
      res.sendStatus(404);
      debug('No APIs found based on header match');
      return null;
    }
  }
  ctx.set('flowAssembly', api.flow);
  ctx.set('config-snapshot-id', api.context.snapshot);
  ctx.set('api', api.context.api);
  ctx.set('plan', api.context.plan);
  ctx.set('client', api.context.client);
  return api;
}

module.exports = function createPreflowMiddleware(options) {
  debug('configuration', options);

  // TODO - assembly is currently hardcoded.
  // To be replaced with file or Jon's config-mgmt model

  return function preflow(req, res, next) {
    // Retrieve the clientId from url param or header and place it in context
    fetchClientInfo(req);

    var ctx = req.ctx;
    var tx = { req: req, res: res, ctx: ctx };

    debug('Use apim-lookup()');
    debug('ctx.get("request.authorization")', ctx.get('request.authorization'));
    var contextgetOptions = {};
    contextgetOptions['path'] = req.originalUrl;
    contextgetOptions['method'] = req.method;
    contextgetOptions['hdrClientId'] = ctx.get('hdr-client-id');
    contextgetOptions['hdrClientSecret'] = ctx.get('hdr-client-secret');
    contextgetOptions['qryClientId'] = ctx.get('qry-client-id');
    contextgetOptions['qryClientSecret'] = ctx.get('qry-client-secret');

    // TODO what if contextget gives error, ex: network error ?
    //      first param of contextget callback should be error
    contextget(tx, contextgetOptions, function(error, apis) {
      if (error) {
        // there was an error with the contextget
        debug('contextget: ', error, apis);
      } else {
        if (apis !== undefined) {
          var api = populateAPImCtx(req, res,ctx, apis);
          console.log (api);
          if (api && api.flow && api.flow.cors && api.flow.cors.enabled) {
            res.set('Access-Control-Allow-Origin', '*');
          }
        }
      }
      next();
    });
  };
};

/**
 * Function that retrieves the client ID and secret from both the request
 * headers and the URL query parameters
 */
function fetchClientInfo(req) {
  var ctx = req.ctx;

  // TODO see if a middleware that ran before this set clientID in the context.

  var clientId = req.query['client_id'];
  ctx.set('qry-client-id', clientId ? clientId : '');
  var clientSecret = req.query['client_secret'];
  ctx.set('qry-client-secret', clientSecret ? clientSecret : '');
  debug('Query Client Id: ' + ctx.get('qry-client-id') +
        ' Secret: ' + ctx.get('qry-client-secret'));

  clientId = req.headers['x-ibm-client-id'];
  ctx.set('hdr-client-id', clientId ? clientId : '');
  clientSecret = req.headers['x-ibm-client-secret'];
  ctx.set('hdr-client-secret', clientSecret ? clientSecret : '');
  debug('Header Client Id: ' + ctx.get('hdr-client-id') +
        ' Secret: ' + ctx.get('hdr-client-secret'));
}
