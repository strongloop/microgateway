'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:preflow'});
var apimlookup = require('./apim-lookup');
var populateAPImCtx = require('./apim-context-populate');
var contextget = apimlookup.contextget;

/**
 * This function checks which API from the `apis` should be
 * used to fulfill the incoming request.
 *
 * @param req the request object from the wire
 * @param ctx the APIm context object
 * @param apis an array of API swagger definition objects
 *
 * @return the API if any match; otherwise, `null` is returned
 *
 */
function filterAPI(req, res, ctx, apis) {
  var api;
  // Did we find any APIs at all?
  if (apis.length === 0) {
    ctx.set('error.statusCode', 404);
    logger.debug('No APIs found');
    return null;
  }

  // If so, was the request able to authenticate for any of them?
  apis = apis.filter(_api => _api.authenticated);
  if (apis.length < 1) {
    ctx.set('error.statusCode', 401);
    return null;
  }

  // So far so good...
  if (apis.length === 1) {
    api = apis[0];
  }  else {
    logger.debug('Multiple API matches found: ', apis.length);
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
      ctx.set('error.statusCode', 404);
      logger.debug('No APIs found based on header match');
      return null;
    }
  }
  return api;
}

module.exports = function createPreflowMiddleware(options) {
  logger.debug('configuration', options);

  // TODO - assembly is currently hardcoded.
  // To be replaced with file or Jon's config-mgmt model

  return function preflow(req, res, next) {
    // Retrieve the clientId from url param or header and place it in context
    fetchClientInfo(req);

    // Update X-Powered-By
    res.setHeader('X-Powered-By', 'IBM API Connect MicroGateway');

    var ctx = req.ctx;

    logger.debug('Use apim-lookup()');
    logger.debug('ctx.get("request.authorization")', ctx.get('request.authorization'));
    var contextgetOptions = {};
    contextgetOptions['path'] = req.originalUrl;
    contextgetOptions['method'] = req.method;
    contextgetOptions['hdrClientId'] = ctx.get('hdr-client-id');
    contextgetOptions['hdrClientSecret'] = ctx.get('hdr-client-secret');
    contextgetOptions['qryClientId'] = ctx.get('qry-client-id');
    contextgetOptions['qryClientSecret'] = ctx.get('qry-client-secret');

    contextget(ctx, contextgetOptions, function(error, apis) {
      if (error || !apis) {
        // there was an error with the contextget
        logger.debug('contextget: ', error, apis);
        error = error || { name: 'PreFlowError', message: 'no match api'};
        next(error);
        return;
      }

      var api = filterAPI(req, res,ctx, apis);
      if (!api) {
        error = { name: 'PreFlowError', message: 'unable to process the request'}
        next(error);
        return;
      }

      populateAPImCtx(api, ctx, req)
        .then( (output) => {
            if (ctx.get('api.document.x-ibm-configuration.cors.enabled')) {
              res.set('Access-Control-Allow-Origin', '*');
            }
            next();
          }
          ,(error) => {
            logger.debug('populateAPImCtx error: ', error);
            next(error);
          } );
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
  logger.debug('Query Client Id: ' + ctx.get('qry-client-id') +
        ' Secret: ' + ctx.get('qry-client-secret'));

  clientId = req.headers['x-ibm-client-id'];
  ctx.set('hdr-client-id', clientId ? clientId : '');
  clientSecret = req.headers['x-ibm-client-secret'];
  ctx.set('hdr-client-secret', clientSecret ? clientSecret : '');
  logger.debug('Header Client Id: ' + ctx.get('hdr-client-id') +
        ' Secret: ' + ctx.get('hdr-client-secret'));
}
