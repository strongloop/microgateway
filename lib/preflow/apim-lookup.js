'use strict';

/**
 * Module dependencies
 */

var _ = require('lodash');
var async = require('async');
var request = require('request');
var url = require('url');
var debug = require('debug')('micro-gateway:preflow');
var crypto = require('crypto');
var security = require('./apim-security');
var dsc = require('../../datastore/client');

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



/**
 * Builds context object based on request options and data-store models
 * @param {Object} tx - Transaction object
 * @param {Object} tx.req - Request object
 * @param {Object} tx.res - Response object
 * @param {Object} tx.ctx - Original context object
 * @param {Object} opts - request options
 * @param {string} opts.hdrClientId - header client ID of request
 * @param {string} opts.hdrClientSecret - header client secret of request
 * @param {string} opts.qryClientId - query parm client ID of request
 * @param {string} opts.qryClientSecret - query parm client secret of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @param {callback} cb - The callback that handles the error or output context
 */
function apimcontextget (tx, opts, cb) {

  debug('apimcontextget entry');

  // extract filters from request
  var filters = grabFilters(opts);
  var snapshot;
  security.setApiKeyHandler(evalApikey);
  port = process.env['DATASTORE_PORT'];

  /*
  function snapshotDataRequest () {
    return dsc.getCurrentSnapshot()
      .then(ss => {
        snapshot = ss;
        debug('apimcontext pass 1');
        return doOptimizedDataRequest(snapshot, filters);
      });
  }

  function defaultCatalogDataRequest () {
    debug('apimcontextget get default context');
    return apimGetDefaultCatalog(snapshot, filters.orgName)
      .then(defaultCat => {
        filters.catName = defaultCat;
        filters.inboundPath = filters.inboundPathAlt;
        debug('apimcontext pass 2');
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
      debug(`apimcontextget final count: ${Array.isArray(apis) ? apis.length : 0}`,
            `value: ${JSON.stringify(apis)}`);
      return [null, apis];
    })
    .catch(err => {
      // Handle error
      debug(`apimcontextget error: ${err}`);
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
        debug('apimcontextget pass 1');
        doOptimizedDataRequest(tx, snapshot, filters)
          .then(apis => { callback((Array.isArray(apis) && apis.length > 0 ? 'done' : null), apis) })
          .catch(callback);
      },

      (prevResult, callback) => {
        // Pass 2 - use the default catalog name
        debug('apimcontextget pass 2');
        filters.inboundPath = filters.inboundPathAlt;
        doOptimizedDataRequest(tx, snapshot, filters)
          .then(apis => { callback((Array.isArray(apis) && apis.length > 0 ? 'done' : null), apis) })
          .catch(callback);
      }
    ],

    (err, apis) => {
      // Got final result
      debug(`apimcontextget final count: ${Array.isArray(apis) ? apis.length : 0},`,
            `err: ${err}, value: ${JSON.stringify(apis)}`);
      cb((err === 'done' ? null : err), apis);
    }
  );

  debug('apimcontextget exit');
  //return promise;
}

function doOptimizedDataRequest(tx, snapshot, filters) {
  debug('doOptimizedDataRequest entry snapshot:' + snapshot +
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
      debug('error: ', error);
      // debug('body: %j', body);
      // debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      // build context(s) of matching APIs
      findContext(tx, filters, body, (err, localcontexts) => {
        debug('contexts after findContext: %j', localcontexts);
        // add flow(s) from API declaration
        if (err) {
          reject(Error(err));
          return;
        }
        addFlows(localcontexts, (err, contexts) => {
          debug('contexts: %j', contexts);
          localcontexts = contexts;
          if (err) {
            reject(Error(err));
            return
          }
          resolve(localcontexts);
        });
      });
    });
  });
}

function evalApikey(tx, context, securityReq, securityDef, filters, callback) {
  debug('evalApikey entry:' +
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
      
  debug('evalApikey result: ' + result);
  callback(result);
}

/**
 * Adds flow information from each API in the array of contexts
 * @param {Array} contexts - array of context objects
 * @param {callback} callback - The callback that handles the error
 *                              or output context
 */
function addFlows(contexts, callback) {

  debug('addFlows entry');
  debug('addFlows contexts:', contexts);
  var localContexts = [];
  async.forEach(contexts,
    function(context, callback) {
      debug('addFlows middle context:', context);
      dsc.grabAPI(context, function(err, apiDef) {
          if (!err) {
            context.flow = apiDef.document['x-ibm-configuration'];
            localContexts.push(context);
          }
          debug('addFlows callback end');
          callback();
        }
      );
    },
    function(err) {
      debug('addFlows error callback');
      callback(err, localContexts);
    }
  );
  debug('addFlows exit1');
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

  debug('grabFilters entry');
  debug('hdrClientId: ' + opts.hdrClientId +
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

  debug('inboundPath: ', inboundPath);
  debug('grabFilters exit');

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
 * @param {Object} tx - Transaction object
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
function findContext(tx, filters, body, contextsCB) {

debug ('findContext entry inPath=' + filters.inboundPath);
  // loop through each API maching the initial filters trying to
  // find the minimal set of ultimately matching APIs
  var matches = [];
  var listOfEntries;
  try {
    listOfEntries = JSON.parse(body);
  } catch (e) {
    console.error(e);
    contextsCB(e, matches);
  }
  // debug('listOfEntries %j', listOfEntries);

  let promise = Promise.resolve();
  _.forEach(listOfEntries, entry => {
    debug('possibleEntryMatch ', entry);

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

      // Evaluate matches against the Swagger security refs and defs
      let reqs = mm.securityReqs;
      let defs = mm.securityDefs;
      promise = promise.then(() => {
        return new Promise((resolve, reject) => {
          security.evalSecurity(tx, entry, reqs, defs, filters, (err, result) => {
            if (err) {
              reject(err);
              return;
            }
            var match = buildPreflowContext(entry, pathobj.path, mm);
            match.authenticated = result;
            matches.push(match);
            resolve();
          });
        });
      });
    });
  });

  promise.then(() => contextsCB(null, matches))
         .catch(err => {
           debug(err);
           contextsCB(err, matches);
         });

  debug ('findContext exit');
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

  debug('findMethodMatch entry');
  debug('Path methods: ' , JSON.stringify(pathMethods,null,4));
  debug('method map: ' , JSON.stringify({method: filterMethod}));
  for (var i = 0; i < pathMethods.length; i++) {
    var possibleMethodMatch = pathMethods[i];
    if (possibleMethodMatch.method === filterMethod) {
      debug('and method/verb matches!');
      debug('findMethodMatch exit');
      return possibleMethodMatch;
    }
  }
  debug('no method/verb match found');
  debug('findMethodMatch exit');
  return {};
}

/**
 * Find the API matching the request HTTP method
 * @param {Object} EntryMatch - object representing matching API entry
 * @param {string} PathMatch - path representing matching API path
 * @param {Object} MethodMatch - object representing matching HTTP method
 * @returns {Object} - context object
 */
function buildPreflowContext(EntryMatch, PathMatch, MethodMatch) {

  debug('buildPreflowContext entry');

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
    'rate-limit': EntryMatch['plan-rate-limit']
  };
  var api = {
    id: EntryMatch['api-id'],
    basepath: EntryMatch['api-base-path'],
    path: PathMatch,
    name: EntryMatch['api-name'],
    version: EntryMatch['api-version'],
    properties: EntryMatch['api-properties'],
    type: EntryMatch['api-type'],
    method: MethodMatch.method,
    operationId: MethodMatch.operationId,
  };

  var internalVariables = {
    consumes: MethodMatch.consumes,
    operation: MethodMatch.method,
    parameters: MethodMatch.parameters,
    path: PathMatch,
    produces: MethodMatch.produces,
    responses: MethodMatch.responses
  };

  var client = {
    app: {
      id: EntryMatch['client-id'],
      secret: EntryMatch['client-secret']
    }
  };
  var context = {
    context: {
      _: internalVariables,
      snapshot: EntryMatch['snapshot-id'],
      catalog: catalog,
      organization: organization,
      product: product,
      plan: plan,
      api: api,
      client: client
    }
  };
  debug('buildPreflowContext context: ', context);

  debug('buildPreflowContext exit');
  return context;
}
