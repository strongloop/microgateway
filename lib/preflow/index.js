// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:preflow'});
var apimlookup = require('./apim-lookup');
var populateAPImCtx = require('./apim-context-populate');
var async = require('async');
var rateLimiting = require('./apim-rate-limiting');
var rateLimiters = require('./apim-lookup').rateLimiters;
var contextget = apimlookup.contextget;

function runRateLimiters(api, ctx) {
  return new Promise(function(resolve, reject) {

    // Seach rateLimit for an unlimited value
    var unlimited = false;
    for (var key in api.rateLimits) {
      if (api.rateLimits.hasOwnProperty(key) &&
          api.rateLimits[key].value.toUpperCase() === 'UNLIMITED') {
        unlimited = true;
        break;
      }
    }

    // Create a promise for each limiter 
    if (api.rateLimits && !unlimited) {
      var properties = Object.getOwnPropertyNames(api.rateLimits);
      var tasks = properties.map(function(name) {
    
        var rateLimit = api.rateLimits[name];
        rateLimit.scope = api.rateLimitScope + ':' + name;
        rateLimit.name = name;

        return function (callback) {
          var limiter = rateLimiters[rateLimit.scope];
          if (!limiter) {
            limiter = rateLimiting(rateLimit);
            rateLimiters[rateLimit.scope] = limiter;
          }
          limiter(ctx, function(err, result) {
            if (err) {
              // Limiter failed, stop processing
              logger.debug("limit exceeded ", rateLimit.name);
              callback(err);
            } else {
              // Next limiter
              callback();
            }
          });
        }
      });

      async.series(tasks, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

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
    ctx.set('error.status.code', 404);
    logger.debug('No APIs found');
    return null;
  }

  // If so, was the request able to authenticate for any of them?
  apis = apis.filter(function(_api) { return _api.authenticated; });
  if (apis.length < 1) {
    ctx.set('error.status.code', 401);
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

    if (planId === undefined) {
       api = apis[0]; //best guess
    } else {
      // TODO Thomas and Jeremy, do we need to check plan version?
      // apis[i].context.plan.version === planVersion
      // var planVersion = req.headers['x-ibm-plan-version'];
      for (var i = 0; i < apis.length; i++) {
        if (apis[i].plan.id === planId) {
          // TODO Thomas and Jeremy, do we need to check plan version?
          // apis[i].context.plan.version === planVersion
          api = apis[i];
          break;
        }
      }
    }

    if (!api) {
      ctx.set('error.status.code', 404);
      logger.debug('No APIs found based on header match');
      return null;
    }
  }
  
  if (api.api.state === "suspended") {
    ctx.set('error.status.code', 503);
    logger.debug('API is currently suspended');
    return null;
  }  
  
  return api;
}

function setCorsHeaders(req, res, allowMethods) {
  var allowedOrigin = req.headers.origin ? req.headers.origin : '*';
  res.setHeader('access-control-allow-origin', allowedOrigin);
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '');
  res.setHeader('access-control-expose-headers', 'APIm-Debug-Trans-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Global-Transaction-ID');
  res.setHeader('access-control-allow-methods', allowMethods);
  res.setHeader('access-control-allow-credentials', allowedOrigin === '*' ? 'false' : 'true');
}

function setPreflightCorsHeaders(req, res, allowMethods) {
  setCorsHeaders(req, res, allowMethods);
  res.end();
}

module.exports = function createPreflowMiddleware(options) {
  logger.debug('configuration', options);

  return function preflow(req, res, next) {
    // Retrieve the clientId from url param or header and place it in context
    fetchClientInfo(req);

    var ctx = req.ctx;

    logger.debug('Use apim-lookup()');
//    sensitive data : headers
//    logger.debug('ctx.get("request.authorization")', ctx.get('request.authorization'));
    var contextgetOptions = {};
    contextgetOptions['path'] = req.url;
    contextgetOptions['method'] = req.method;
    contextgetOptions['hdrClientId'] = ctx.get('hdr-client-id');
    contextgetOptions['hdrClientSecret'] = ctx.get('hdr-client-secret');
    contextgetOptions['qryClientId'] = ctx.get('qry-client-id');
    contextgetOptions['qryClientSecret'] = ctx.get('qry-client-secret');

    contextget(ctx, res, contextgetOptions, function(error, apis) {
      if (error && error.message === 'preflight') {
        setPreflightCorsHeaders(req, res, error.allowMethods);
        return;
      }

      if (error || !apis) {
        // there was an error with the contextget
        logger.debug('contextget: ', error, apis);
        error = error || { name: 'PreFlowError', message: 'no match api'};
        next(error);
        return;
      }

      var allowMethods = apis.length > 0 ? apis[0].allowMethods : '';
      if (allowMethods !== '') setCorsHeaders(req, res, allowMethods);

      var api = filterAPI(req, res,ctx, apis);
      if (!api) {
        error = { name: 'PreFlowError', message: 'unable to process the request'};
        next(error);
        return;
      }

      runRateLimiters(api, ctx).then(function() {
        return populateAPImCtx(api, ctx, req);
      }, function(err) {
        logger.debug('runRateLimiters error: ', err);
        //next(err);
        throw err;
      }).then(function(output) {
        if (api.allowMethods !== '') {
          setCorsHeaders(req, res, api.allowMethods);
        }
        next();
      }, function(err) {
        logger.debug('populateAPImCtx error: ', err);
        //next(err);
        throw err;
      }).catch(function (err) {
        logger.debug('error', err);
        next(err);
      });
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
//  sensitive data: headers
//  logger.debug('Query Client Id: ' + ctx.get('qry-client-id') +
//        ' Secret: ' + ctx.get('qry-client-secret'));

  clientId = req.headers['x-ibm-client-id'];
  ctx.set('hdr-client-id', clientId ? clientId : '');
  clientSecret = req.headers['x-ibm-client-secret'];
  ctx.set('hdr-client-secret', clientSecret ? clientSecret : '');
//  sensitive data: headers
//  logger.debug('Header Client Id: ' + ctx.get('hdr-client-id') +
//        ' Secret: ' + ctx.get('hdr-client-secret'));
}
