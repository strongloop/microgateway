'use strict';

/**
 * Module dependencies
 */

var _ = require('lodash');
var async = require('async');
var request = require('request');
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:preflow:apim-lookup'});
var crypto = require('crypto');
var security = require('./apim-security');
var dsc = require('../../datastore/client');
var rateLimiting = require('./apim-rate-limiting');
var evalBasic = require('./apim-security-basic');

/**
 * Module exports
 */
module.exports = {
  contextget: apimcontextget
};


/**
 * Module globals
 */

var host = '127.0.0.1'; // data-store's listening interface
var port; // data-store's listening port

// Cache of rate limiters by plan id
var rateLimiters = {};

/**
 * Builds context object based on request options and data-store models
 * @param {Object} ctx - Context object
 * @param {Object} opts - request options
 * @param {string} opts.hdrClientId - header client ID of request
 * @param {string} opts.hdrClientSecret - header client secret of request
 * @param {string} opts.qryClientId - query parm client ID of request
 * @param {string} opts.qryClientSecret - query parm client secret of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @param {callback} cb - The callback that handles the error or output context
 */
function apimcontextget (ctx, opts, cb) {

  logger.debug('apimcontextget entry');

  // extract filters from request
  var filters = grabFilters(opts);
  var snapshot;
  security.setApiKeyHandler(evalApikey);
  security.setBasicAuthHandler(evalBasic);
  port = process.env['DATASTORE_PORT'];

  /*
  function snapshotDataRequest () {
    return dsc.getCurrentSnapshot()
      .then(ss => {
        snapshot = ss;
        logger.debug('apimcontext pass 1');
        return doOptimizedDataRequest(snapshot, filters);
      });
  }

  function defaultCatalogDataRequest () {
    logger.debug('apimcontextget get default context');
    return apimGetDefaultCatalog(snapshot, filters.orgName)
      .then(defaultCat => {
        filters.catName = defaultCat;
        filters.inboundPath = filters.inboundPathAlt;
        logger.debug('apimcontext pass 2');
        return doOptimizedDataRequest(snapshot, filters);
      });
  }

  let promise = snapshotDataRequest()
    .then(apis => {
      if (Array.isArray(apis) && apis.length > 0)
        return apis;
      else
        return defaultCatalogDataRequest();
    })
    .then(apis => {
      logger.debug(`apimcontextget final count: ${Array.isArray(apis) ? apis.length : 0}`,
            `value: ${JSON.stringify(apis)}`);
      return [null, apis];
    })
    .catch(err => {
      // Handle error
      logger.debug(`apimcontextget error: ${err}`);
      return [err, null];
    });

  promise.then(args => {
    if (!!cb) cb.apply(null, args);
    return args;
  });
  */

  async.waterfall(
    [
      callback => {
        dsc.getCurrentSnapshot()
          .then(ss => { snapshot = ss; callback(); })
          .catch(callback);
      },

      callback => {
        // Pass 1 - all filters available
        logger.debug('apimcontextget pass 1');
        doOptimizedDataRequest(ctx, snapshot, filters)
          .then(apis => { callback((Array.isArray(apis) && apis.length > 0 ? 'done' : null), apis) })
          .catch(callback);
      },

      (prevResult, callback) => {
        // Pass 2 - use the default catalog name
        logger.debug('apimcontextget pass 2');
        filters.inboundPath = filters.inboundPathAlt;
        doOptimizedDataRequest(ctx, snapshot, filters)
          .then(apis => { callback((Array.isArray(apis) && apis.length > 0 ? 'done' : null), apis) })
          .catch(callback);
      }
    ],

    (err, apis) => {
      // Got final result
      logger.debug(`apimcontextget final count: ${Array.isArray(apis) ? apis.length : 0},`,
            `err: ${err}, value: ${JSON.stringify(apis)}`);
      cb((err === 'done' ? null : err), apis);
    }
  );

  logger.debug('apimcontextget exit');
  //return promise;
}

function doOptimizedDataRequest(ctx, snapshot, filters) {
  logger.debug('doOptimizedDataRequest entry snapshot:' + snapshot +
                              '\n hdrClientId:' + filters.hdrClientId +
                              '\n hdrClientSecret:' + filters.hdrClientSecret +
                              '\n qryClientId:' + filters.qryClientId +
                              '\n qryClientSecret:' + filters.qryClientSecret +
                              '\n path:' + filters.inboundPath +
                              '\n method:' + filters.method );
  // build request to send to data-store
  let snapshotFilter = `{"snapshot-id": "${snapshot }"}`;
  let queryfilter =
    `{"where": { "and":[${snapshotFilter}]}}`;
  let queryurl = `http://${host}:${port}/api/optimizedData?filter=${encodeURIComponent(queryfilter)}`;

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, function (error, response, body) {
      logger.debug('error: ', error);
      // logger.debug('body: %j', body);
      // logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      // build context(s) of matching APIs
      findContext(ctx, filters, body, (err, localcontexts) => {
        logger.debug('contexts after findContext: %j', localcontexts);
        // add flow(s) from API declaration
        if (err) {
          reject(Error(err));
          return;
        }
        resolve(localcontexts);

        // as context already contains the swagger info,
        // no need to call addFlows again.
        /*
        addFlows(localcontexts, (err, contexts) => {
          logger.debug('contexts: %j', contexts);
          localcontexts = contexts;
          if (err) {
            reject(Error(err));
            return
          }
          resolve(localcontexts);
        });
        */
      });
    });
  });
}

function evalApikey(ctx, context, securityReq, securityDef, filters, callback) {
  logger.debug('evalApikey entry:' +
        '\n   in: ' + securityDef.in +
        '\n   name: ' + securityDef.name +
        '\n   incoming id: ' + context['client-id'] +
        '\n   incoming secret: ' + context['client-secret'] +
        '\n   hdrId: ' + filters.hdrClientId +
        '\n   hdrSecret: ' + filters.hdrClientSecret +
        '\n   qryId: ' + filters.qryClientId +
        '\n   qrySecret: ' + filters.qryClientSecret);

  var result = false;
  if ((securityDef.in === 'header' &&
       ((securityDef.name === 'X-IBM-Client-Id' &&
         filters.hdrClientId === context['client-id']) ||
        (securityDef.name === 'X-IBM-Client-Secret' &&
         filters.hdrClientSecret === context['client-secret']))) ||
      (securityDef.in === 'query' &&
       ((securityDef.name === 'client_id' &&
         filters.qryClientId === context['client-id']) ||
        (securityDef.name === 'client_secret' &&
         filters.qryClientSecret === context['client-secret'])))) {
    result = true;
  }

  logger.debug('evalApikey result: ' + result);
  callback(result);
}

/**
 * Adds flow information from each API in the array of contexts
 * @param {Array} contexts - array of context objects
 * @param {callback} callback - The callback that handles the error
 *                              or output context
 */
function addFlows(contexts, callback) {

  logger.debug('addFlows entry');
  logger.debug('addFlows contexts:', contexts);
  var localContexts = [];
  async.forEach(contexts,
    function(context, callback) {
      logger.debug('addFlows middle context:', context);
      dsc.grabAPI(context, function(err, apiDef) {
          if (!err) {
            context.flow = apiDef.document['x-ibm-configuration'];
            localContexts.push(context);
          }
          logger.debug('addFlows callback end');
          callback();
        }
      );
    },
    function(err) {
      logger.debug('addFlows error callback');
      callback(err, localContexts);
    }
  );
  logger.debug('addFlows exit1');
}

function getHashedValue(s) {
  if (s === '') {
    return s;
  } else {
    return crypto.createHash('sha256').update(s).digest('base64');
  }
}

/**
 * Extracts client ID, organization, catalog, method and remaining path
 * @param {Object} opts - request options
 * @param {string} opts.hdrClientId - header client ID of request
 * @param {string} opts.hdrClientSecret - header client secret of request
 * @param {string} opts.qryClientId - query parm client ID of request
 * @param {string} opts.qryClientSecret - query parm client secret of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @returns {Object} - object containing client ID, org, catalog, method & path
 */
function grabFilters(opts) {

  logger.debug('grabFilters entry');
  logger.debug('hdrClientId: ' + opts.hdrClientId +
        '\n hdrClientSecret: ' + opts.hdrClientSecret +
        '\n qryClientId: ' + opts.qryClientId +
        '\n qryClientSecret: ' + opts.hdrClientSecret);

  var parsedUrl = url.parse(opts.path, true /* query string */);
  var uri = parsedUrl.pathname.split('/');

  var inboundPath = (uri.length === 1) ? '/' : '';
  for (var i = 1; i < uri.length; i++) {
    inboundPath += '/' + uri[i];
  }

  var inboundPathAlt = (uri.length === 0) ? '/' : '';
  for (i = 0; i < uri.length; i++) {
    inboundPathAlt += '/' + uri[i];
  }

  logger.debug('inboundPath: ', inboundPath);
  logger.debug('grabFilters exit');

  return {hdrClientId: opts.hdrClientId,
          hdrClientSecret: getHashedValue(opts.hdrClientSecret),
          qryClientId: opts.qryClientId,
          qryClientSecret: getHashedValue(opts.qryClientSecret),
          inboundPath: inboundPath,
          inboundPathAlt: inboundPathAlt,
          method: opts.method};
}

/**
 * Builds context(s) based on matching data-store entries against request
 * @param {Object} ctx - Context object
 * @param {Object} filter - filter representing info from request
 * @param {string} filter.clientid - client ID of request
 * @param {string} filter.orgName - organization of request
 * @param {string} filter.catName - catalog of request
 * @param {string} filter.inboundPath - API requested
 * @param {string} filter.method - HTTP request method
 * @param {string} body - JSON representation of data-store information
 *                        matching filter
 * @param {Array} - array of context objects representing matching entries
 */
 function findContext(ctx, filters, body, contextsCB) {

   logger.debug('findContext entry inPath=' + filters.inboundPath);
   // loop through each API maching the initial filters trying to
   // find the minimal set of ultimately matching APIs
   var matches = [];
   var listOfEntries;

   var apiMatches = [];
   var bestScore = Number.MAX_VALUE;  //some arbitrary high number

   try {
     listOfEntries = JSON.parse(body);
   } catch (e) {
     logger.error(e);
     contextsCB(e, matches);
   }
   // logger.debug('listOfEntries %j', listOfEntries);

   let promise = Promise.resolve();
   _.forEach(listOfEntries, entry => {
     logger.debug('possibleEntryMatch ', entry);

     _.forEach(entry['api-paths'], pathobj => {

       // get path match regular expression
       var re = new RegExp(pathobj['path-regex']);
       if (!re.test(filters.inboundPath)) {
         return;
       }

       var mm = findMethodMatch(filters.method, pathobj['path-methods']);
       if (!Object.keys(mm).length) {
         return;
       }

       if (pathobj['matching-score'] <= bestScore) {
         //if maching-score is the same or better, add it
         var candidate = {
           score: pathobj['matching-score'],
           entry: entry,
           pathobj: pathobj,
           mm: mm
         }

         if (pathobj['matching-score'] < bestScore) {
           //if maching-score is the best yet, clear the array and start over
           apiMatches = [];
           bestScore = pathobj['matching-score']
         }

         apiMatches.push(candidate);
       }

     });
   });

   _.forEach(apiMatches, mc => { //mc = matchCandidate
     // Evaluate matches against the Swagger security refs and defs
     let reqs = mc.mm.securityReqs;
     let defs = mc.mm.securityDefs;
     promise = promise.then(() => {
       return new Promise((resolve, reject) => {
         security.evalSecurity(ctx, mc.entry, reqs, defs, filters, (err, result) => {
           if (err) {
             reject(err);
             return;
           }
           var match = buildPreflowContext(mc.entry, mc.pathobj.path, mc.mm);
           match.authenticated = result;
           matches.push(match);
            ctx.flowContext = match;

            var plan = match.plan;
            var rateLimit = mc.mm['observed-rate-limit'];
            if (rateLimit) {
              var scope =mc.mm['rate-limit-scope'];
              rateLimit.scope = scope;
              var limiter = rateLimiters[scope];
              if (!limiter) {
                limiter = rateLimiting(rateLimit);
                rateLimiters[scope] = limiter;
              }
              logger.debug('rateLimit start: ', rateLimit, match);
              limiter({}, ctx, (err, result) => {
                if (err) {
                  reject(err);
                  return;
                }
                resolve();
              });
            } else {
              resolve();
            }
          });
        });
      });
    });

   promise.then(() => contextsCB(null, matches))
          .catch(err => {
            logger.debug(err);
            contextsCB(err, matches);
          });

   logger.debug('findContext exit');
 }

/**
 * Find the API matching the request HTTP method
 * @param {string} filterMethod - HTTP method of request
 * @param {Object} pathMethods - array of HTTP methods for matched API
 * @param {string} possibleEntryMatchMethod - HTTP method
 * @returns {Object} - matching method or empty object (on no match)
 */
function findMethodMatch(filterMethod,
                         pathMethods) {

  logger.debug('findMethodMatch entry');
  logger.debug('Path methods: ' , JSON.stringify(pathMethods,null,4));
  logger.debug('method map: ' , JSON.stringify({method: filterMethod}));
  for (var i = 0; i < pathMethods.length; i++) {
    var possibleMethodMatch = pathMethods[i];
    if (possibleMethodMatch.method === filterMethod) {
      logger.debug('and method/verb matches!');
      logger.debug('findMethodMatch exit');
      return possibleMethodMatch;
    }
  }
  logger.debug('no method/verb match found');
  logger.debug('findMethodMatch exit');
  return null;
}

/**
 * Find the API matching the request HTTP method
 * @param {Object} EntryMatch - object representing matching API entry
 * @param {string} PathMatch - path representing matching API path
 * @param {Object} MethodMatch - object representing matching HTTP method
 * @returns {Object} - context object
 */
function buildPreflowContext(EntryMatch, PathMatch, MethodMatch) {

  logger.debug('buildPreflowContext entry');

  var catalog = {
    id: EntryMatch['catalog-id'],
    name: EntryMatch['catalog-name']
  };
  var organization = {
    id: EntryMatch['organization-id'],
    name: EntryMatch['organization-name']
  };
  var product = {
    id: EntryMatch['product-id'],
    name: EntryMatch['product-name']
  };
  var plan = {
    id: EntryMatch['plan-id'],
    name: EntryMatch['plan-name'],
    version: EntryMatch['plan-version'],
    rateLimit: EntryMatch['plan-rate-limit']
  };
  var api = {
//    id: EntryMatch['api-id'],  // not public context var
    document: EntryMatch['api-document'],
//    path: PathMatch,           // not public context var
    name: EntryMatch['api-name'],
    version: EntryMatch['api-version'],
    properties: EntryMatch['api-properties'],
    type: EntryMatch['api-type'],
//    method: MethodMatch.method,  // not public context var
//    operationId: MethodMatch.operationId, // not public context var
    org: organization
  };

  var internalVariables = {
    assembly: EntryMatch['api-assembly'],
    consumes: MethodMatch.consumes,
    operation: MethodMatch.method,
    operationId: MethodMatch.operationId,
    parameters: MethodMatch.parameters,
    path: PathMatch,
    produces: MethodMatch.produces,
    responses: MethodMatch.responses
  };

  var client = {
    app: {
      id: EntryMatch['client-id'],
      name: EntryMatch['client-name']
    },
    org: {
      id: EntryMatch['client-org-id'],
      name: EntryMatch['client-org-name']
    }
  };

  var context = {
    _: internalVariables,
    snapshot: EntryMatch['snapshot-id'],
    catalog: catalog,
    env: {
      path: catalog.name
    },
    organization: organization,
    product: product,
    plan: plan,
    api: api,
    client: client
  };
  logger.debug('buildPreflowContext context: ', context);

  logger.debug('buildPreflowContext exit');
  return context;
}
