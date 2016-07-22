// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var async = require('async');
var Promise = require('bluebird');
var request = require('request');
var url = require('url');
var lru = require('lru-cache');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:preflow:apim-lookup' });
var crypto = require('crypto');
var security = require('./apim-security');
var dsc = require('../../datastore/client');
var evalBasic = require('./apim-security-basic').evalBasic;
var evalOauth2 = require('./apim-security-oauth2').evalOauth2;

// Optimized Data Cache - Just need to hold a few snapshots to prevent thrashing when snapshots update
var optimizedDataCache = lru({ max: 3 });

// Cache of rate limiters by plan id
var rateLimiters = {};

/**
 * Module exports
 */
module.exports = {
  contextget: apimcontextget,
  rateLimiters: rateLimiters };


/**
 * Module globals
 */

var host = '127.0.0.1'; // data-store's listening interface
var port; // data-store's listening port

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
function apimcontextget(ctx, res, opts, cb) {
  logger.debug('apimcontextget entry');

  // extract filters from request
  var filters = grabFilters(opts);
  var snapshot;
  security.setApiKeyHandler(evalApikey);
  security.setBasicAuthHandler(evalBasic);
  security.setOauth2Handler(evalOauth2);
  port = process.env.DATASTORE_PORT;

  async.waterfall([
    function(callback) {
      dsc.getCurrentSnapshot()
        .then(function(ss) {
          snapshot = ss;
          res.on('finish', function() {
            logger.debug('releasing: ', ss);
            dsc.releaseCurrentSnapshot(ss);
          });
          callback();
        })
        .catch(callback);
    },

    function(callback) {
      logger.debug('apimcontextget pass 1');
      doOptimizedDataRequest(ctx, snapshot, filters)
        .then(function(apis) {
          callback((Array.isArray(apis) && apis.length > 0 ? 'done' : null), apis);
        }, callback);
    } ],

    function(err, apis) {
      // Got final result
      if (logger.debug()) {
        logger.debug('apimcontextget final count: %d, err: %j, value: %j',
              (Array.isArray(apis) ? apis.length : 0), err, JSON.stringify(apis));
      }
      cb((err === 'done' ? null : err), apis);
    }
  );

  logger.debug('apimcontextget exit');
  //return promise;
}

function doOptimizedDataRequest(ctx, snapshot, filters) {
  logger.debug('doOptimizedDataRequest entry snapshot:',
          snapshot,
          // sensitive data
          //'\n hdrClientId:', filters.hdrClientId,
          //'\n hdrClientSecret:', filters.hdrClientSecret,
          //'\n qryClientId:', filters.qryClientId,
          //'\n qryClientSecret:', filters.qryClientSecret,
          '\n path:', filters.inboundPath,
          '\n method:', filters.method);

  var optimizedJson = optimizedDataCache.get(snapshot);
  if (!!optimizedJson) {
    return new Promise(function(resolve, reject) {
      findContext(ctx, filters, optimizedJson, function(err, localcontexts) {
        logger.debug('contexts after findContext: %j', localcontexts);
        // add flow(s) from API declaration
        if (err) {
          if (!(err instanceof Error)) {
            err = new Error(err);
          }
          reject(err);
          return;
        }
        resolve(localcontexts);
      });
    });
  }

  // build request to send to data-store
  var snapshotFilter = {};
  snapshotFilter['snapshot-id'] = snapshot;

  var queryfilter = { where: { and: [] } };
  queryfilter.where.and[0] = snapshotFilter;

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: port,
    pathname: '/api/optimizedData',
    query: { filter: JSON.stringify(queryfilter) } };
  var queryurl = url.format(queryurlObj);

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({ url: queryurl }, function(error, response, body) {
      // exit early on error
      if (error) {
        logger.debug('error: ', error);
        if (!(error instanceof Error)) {
          error = new Error(error);
        }
        reject(error);
        return;
      }
      optimizedDataCache.set(snapshot, body);
      // build context(s) of matching APIs
      findContext(ctx, filters, body, function(err, localcontexts) {
        logger.debug('contexts after findContext: %j', localcontexts);
        // add flow(s) from API declaration
        if (err) {
          if (!(err instanceof Error)) {
            err = new Error(error);
          }
          reject(err);
          return;
        }
        resolve(localcontexts);

      });
    });
  });
}

function evalApikey(ctx, context, securityReq, securityDef, filters, callback) {
  logger.debug('evalApikey entry:',
        '\n   in:', securityDef.in,
        '\n   name:', securityDef.name);
        /*, sensitive data
        '\n   incoming id:', context['client-id'],
        '\n   incoming secret:', context['client-secret'],
        '\n   hdrId:', filters.hdrClientId,
        '\n   hdrSecret:', filters.hdrClientSecret,
        '\n   qryId:', filters.qryClientId,
        '\n   qrySecret:', filters.qryClientSecret );
        */

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

function getHashedValue(s) {
  if (s === '') {
    return s;
  } else {
    return crypto.createHash('sha256').update(s).digest('base64');
  }
}

/**
 * Extracts client ID, client secret, method and paths
 * @param {Object} opts - request options
 * @param {string} opts.hdrClientId - header client ID of request
 * @param {string} opts.hdrClientSecret - header client secret of request
 * @param {string} opts.qryClientId - query parm client ID of request
 * @param {string} opts.qryClientSecret - query parm client secret of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @returns {Object} - object containing client ID, client secret, method & paths
 */
function grabFilters(opts) {

  logger.debug('grabFilters entry');
  //sensitive data
  //logger.debug('hdrClientId:', opts.hdrClientId,
  //          '\n hdrClientSecret:', opts.hdrClientSecret,
  //          '\n qryClientId:', opts.qryClientId,
  //          '\n qryClientSecret:', opts.hdrClientSecret);

  var parsedUrl = url.parse(opts.path, true /* query string */);
  var uri = parsedUrl.pathname.split('/');

  var inboundPath = (uri.length === 1) ? '/' : '';
  for (var i = 1; i < uri.length; i++) {
    inboundPath += '/' + uri[i];
  }

  logger.debug('inboundPath: ', inboundPath);
  logger.debug('grabFilters exit');

  return { hdrClientId: opts.hdrClientId,
           hdrClientSecret: getHashedValue(opts.hdrClientSecret),
           qryClientId: opts.qryClientId,
           qryClientSecret: getHashedValue(opts.qryClientSecret),
           inboundPath: inboundPath,
           method: opts.method };
}

function isCorsEnabled(entry) {
  var apidoc = entry && entry['api-document'];
  var ibmconf = apidoc && apidoc['x-ibm-configuration'];
  var cors = ibmconf && ibmconf['cors'];
  return (((cors && cors.enabled) === true) || (ibmconf && !cors) || !ibmconf);
}

/**
 * Builds context(s) based on matching data-store entries against request
 * @param {Object} ctx - Context object
 * @param {Object} filter - filter representing info from request
 * @param {string} filter.hdrClientId - client ID of request from header
 * @param {string} filter.hdrClientSecret - client secret of request from header
 * @param {string} filter.qryClientId - client ID of request from query param
 * @param {string} filter.qryClientSecret - client secret of request from query param
 * @param {string} filter.inboundPath - API requested
 * @param {string} filter.method - HTTP request method
 * @param {string} body - JSON representation of data-store information
 *                        matching filter
 * @param {Array} - array of context objects representing matching entries
 */
function findContext(ctx, filters, body, contextsCB) {
  logger.debug('findContext entry inPath=', filters.inboundPath);
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

  var promise = Promise.resolve();
  _.forEach(listOfEntries, function(entry) {
    logger.debug('possibleEntryMatch ', entry);

    _.forEach(entry['api-paths'], function(pathobj) {
      // get path match regular expression
      logger.debug('compare path:', filters.inboundPath, ' to regex:', pathobj['path-regex']);
      var re = new RegExp(pathobj['path-regex']);
      if (!re.test(filters.inboundPath)) {
        return;
      }

      logger.debug('compare method: ', filters.method, ' api paths:', pathobj['path-methods']);
      var mm = findMethodMatch(filters.method, pathobj['path-methods']);
      if ((mm === null || !Object.keys(mm).length)) {
        // If method === OPTIONS && CORS is enabled
        //   proxy the request and make sure response comes back with all headers set
        // else, return --> respond with 404 (technically, it should be 405, but whatever)
        if (!(filters.method === 'OPTIONS' && isCorsEnabled(entry))) {
          return;
        }
      }
      var allowMethods = isCorsEnabled(entry) ?
              _.map(pathobj['path-methods'], function(pm) { return pm.method; }).join(',') :
              '';
      if (allowMethods !== '' && allowMethods.indexOf('OPTIONS') <= -1) {
        allowMethods += ',OPTIONS';
      }

      if (pathobj['matching-score'] <= bestScore) {
        //if maching-score is the same or better, add it
        var candidate = {
          score: pathobj['matching-score'],
          entry: entry,
          pathobj: pathobj,
          mm: mm,
          allowMethods: allowMethods };

        if (pathobj['matching-score'] < bestScore) {
          //if maching-score is the best yet, clear the array and start over
          apiMatches = [];
          bestScore = pathobj['matching-score'];
        }

        apiMatches.push(candidate);
      }
    });
  });

  logger.debug('matching APIs: ', apiMatches);
  if (apiMatches.length > 0 && apiMatches[apiMatches.length - 1].mm === null) {
    var mc = apiMatches[apiMatches.length - 1];
    //promise = promise.then(function () { return corsShortCircuit(mc); }).then(function (res) {
    //  contextsCB(res);
    //});
    var err = new Error('preflight');
    err.allowMethods = mc.allowMethods;
    contextsCB(err, []);
    return;
  }

  _.forEach(apiMatches, function(mc) { //mc = matchCandidate
    // Evaluate matches against the Swagger security refs and defs
    var reqs = mc.mm.securityReqs;
    var defs = mc.mm.securityDefs;
    promise = promise.then(function() {
      return new Promise(function(resolve, reject) {
        security.evalSecurity(ctx, mc.entry, reqs, defs, filters, function(err, result) {
          if (err) {
            reject(err);
            return;
          }
          var match = buildPreflowContext(mc.entry, mc.pathobj.path, mc.mm);
          match.authenticated = result;
          match.allowMethods = mc.allowMethods;
          match.rateLimits = mc.mm['observed-rate-limit'];
          match.rateLimitScope = mc.mm['rate-limit-scope'];
          matches.push(match);
          ctx.flowContext = match;
          resolve();
        });
      });
    });
  });

  promise.then(function() { contextsCB(null, matches); }).catch(function(err) {
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
 * @returns {Object} - matching method or null (on no match)
 */
function findMethodMatch(filterMethod,
                         pathMethods) {

  if (logger.debug()) {
    logger.debug('findMethodMatch entry');
    logger.debug('Path methods: %s', JSON.stringify(pathMethods, null, 4));
    logger.debug('method map: %j', { method: filterMethod });
  }
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
    name: EntryMatch['catalog-name'] };
  var organization = {
    id: EntryMatch['organization-id'],
    name: EntryMatch['organization-name'] };
  var product = {
    id: EntryMatch['product-id'],
    name: EntryMatch['product-name'] };
  var rateLimit;
  var rateLimits = EntryMatch['plan-rate-limit'];
  if (rateLimits) {
    for (var i = 0; i < rateLimits.length; i++) {
      if (Object.keys(rateLimits[i])[0] === 'x-ibm-unnamed-rate-limit') {
        rateLimit = rateLimits[i]['x-ibm-unnamed-rate-limit'];
        rateLimits.splice(i, 1);
        break;
      }
    }
  }
  var plan = {
    id: EntryMatch['plan-id'],
    name: EntryMatch['plan-name'],
    version: EntryMatch['plan-version'],
    'rate-limit': rateLimit };
  if (rateLimits && !_.isEmpty(rateLimits)) {
    plan['rate-limits'] = rateLimits;
  }
  var api = {
    //id: EntryMatch['api-id'],  // not public context var
    document: EntryMatch['api-document'],
    //path: PathMatch,           // not public context var
    name: EntryMatch['api-name'],
    version: EntryMatch['api-version'],
    properties: EntryMatch['api-properties'],
    type: EntryMatch['api-type'],
    state: EntryMatch['api-state'],
    //method: MethodMatch.method,  // not public context var
    //operationId: MethodMatch.operationId, // not public context var
    org: organization,
    operation: {
      id: MethodMatch.operationId,
      path: PathMatch } };

  var internalVariables = {
    id: EntryMatch['api-id'],
    assembly: EntryMatch['api-assembly'],
    consumes: MethodMatch.consumes,
    operation: MethodMatch.method.toLowerCase(), // per swagger spec
    operationId: MethodMatch.operationId,
    parameters: MethodMatch.parameters,
    path: PathMatch,
    produces: MethodMatch.produces,
    responses: MethodMatch.responses,
    'subscription-id': EntryMatch['subscription-id'] };

  var client = {
    app: {
      id: EntryMatch['client-id'],
      name: EntryMatch['client-name'] },
    org: {
      id: EntryMatch['client-org-id'],
      name: EntryMatch['client-org-name'] } };

  var context = {
    _: internalVariables,
    snapshot: EntryMatch['snapshot-id'],
    catalog: catalog,
    env: {
      path: catalog.name },
    organization: organization,
    product: product,
    plan: plan,
    api: api,
    client: client };
  logger.debug('buildPreflowContext context: ', context);

  logger.debug('buildPreflowContext exit');
  return context;
}
