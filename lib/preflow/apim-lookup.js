/**
 * Module dependencies
 */

var async = require('async');
var request = require('request');
var url = require('url');
var debug = require('debug')('strong-gateway:preflow');
var crypto = require('crypto');
var security = require('./apim-security');

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
 * @param {Object} opts - request options
 * @param {Object} opts.hdrAuthorization - authorization data from request header
 * @param {string} opts.hdrClientId - header client ID of request
 * @param {string} opts.hdrClientSecret - header client secret of request
 * @param {string} opts.qryClientId - query parm client ID of request
 * @param {string} opts.qryClientSecret - query parm client secret of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @param {callback} cb - The callback that handles the error or output context
 */
function apimcontextget (opts, cb) {

  debug('apimcontextget entry');

  // extract filters from request
  var filters = grabFilters(opts);
  var snapshot;
  security.setApiKeyHandler(evalApikey);
  port = process.env['DATASTORE_PORT'];

  async.waterfall([
    function(callback) {
      getCurrentSnapshot(function(err, ss) {
                           snapshot = ss;
                           callback(err);
                         });
    },
    function(callback) {
      // Pass 1 - all filters available
      debug('apimcontextget pass 1');
      doOptimizedDataRequest(snapshot,
                             filters,
                             function(err, apis) {
                               callback(!err && apis.length ? 'done' : err,
                                        apis);
                             });
      },
    function(prevResult, callback) {
      // Get the default catalog name
      debug('apimcontextget get default context');
      apimGetDefaultCatalog(snapshot,
                            filters.orgName,
                            function(err, defaultCat) {
                                     filters.catName = defaultCat;
                                     callback(err, defaultCat);
                            });
    },
    function(prevResult, callback) {
      // Pass 2 - use the default catalog name
      debug('apimcontextget pass 2');
      filters.inboundPath = filters.inboundPathAlt;
      doOptimizedDataRequest(snapshot,
                             filters,
                             function(err, apis) {
                               callback(!err && apis.length ? 'done' : err,
                                        apis);
                             });
    },
  ], function (err, apis) {
    // Got final result
    debug('apimcontextget final count: ',
          apis ? apis.length : 0, ' err: ', err,
          ' value: ', JSON.stringify(apis));
    cb(err === 'done' ? null : err, apis);
  });

  debug('apimcontextget exit');
}

function getCurrentSnapshot(cb) {
  debug('getCurrentSnapshot entry');
  // build request to send to data-store
  var queryurl = 'http://' + host + ':' + port +
    '/api/snapshots/current';

  // send request to optimizedData model from data-store
  // for matching API(s)
  request(
    {
      url : queryurl
    },
    function (error, response, body) {
      debug('error: ', error);
      debug('body: %j' , body);
      debug('response: %j' , response);
      // exit early on error
      if (error) {
        cb(Error(error), null);
        return;
      }
      var snapshot;
      try {
        snapshot = JSON.parse(body);
      } catch (e) {
        cb(e, null);
        return;
      }
      debug('snapshot: ', snapshot.snapshot.id);
      cb(null, snapshot.snapshot.id);
    }
  );
}

function doOptimizedDataRequest(snapshot,
                                filters,
                                cb) {
  debug('doOptimizedDataRequest entry snapshot:' + snapshot +
                              '\n orgName:' + filters.orgName +
                              '\n catName:' + filters.catName +
                              '\n hdrClientId:' + filters.hdrClientId +
                              '\n hdrClientSecret:' + filters.hdrClientSecret +
                              '\n qryClientId:' + filters.qryClientId +
                              '\n qryClientSecret:' + filters.qryClientSecret +
                              '\n path:' + filters.inboundPath +
                              '\n method:' + filters.method );
  // build request to send to data-store
  var snapshotFilter = '{"snapshot-id": "' + snapshot + '"}';
  var catalogNameFilter = '{"catalog-name": "' + filters.catName + '"}';
  var organizationNameFilter =
    '{"organization-name": "' + filters.orgName + '"}';
  var queryfilter =
    '{"where": { "and":[' + snapshotFilter + ',' +
    catalogNameFilter + ',' + organizationNameFilter + ']}}';
  var queryurl = 'http://' + host + ':' + port +
    '/api/optimizedData?filter=' + encodeURIComponent(queryfilter);

  // send request to optimizedData model from data-store
  // for matching API(s)
  request(
    {
      url : queryurl
    },
    function (error, response, body) {
      debug('error: ', error);
      debug('body: %j' , body);
      debug('response: %j' , response);
      // exit early on error
      if (error) {
        cb(Error(error), null);
        return;
      }
      // build context(s) of matching APIs
      findContext(filters, body,
        function(err, localcontexts) {
          debug('contexts after findContext: %j', localcontexts);
          // add flow(s) from API declaration
          addFlows(
            localcontexts,
            function (err, contexts) {
              debug('contexts: %j', contexts);
                localcontexts = contexts;
                cb(err, localcontexts);
            }
          );
        }
      );
    }
  );
}

/**
 * Finds the default catalog/environment for a specific provider organization
 * @param {string} snapshot - Snapshot identifier
 * @param {string} orgName - Name or provider organization
 * @param {callback} cb - The callback that handles the error or output context
 */
function apimGetDefaultCatalog(snapshot, orgName, cb) {
  var snapshotFilter = '{"snapshot-id": "' + snapshot + '"}';
  var orgNameFilter = '{"organization.name": "' + orgName + '"}';
  var defaultOrgFilter = '{"default": "true"}';
  var queryfilter =
    '{"where": { "and":[' +
    snapshotFilter + ',' +
    orgNameFilter + ',' +
    defaultOrgFilter + ']}}';
  var queryurl = 'http://' + host + ':' + port +
    '/api/catalogs?filter=' + encodeURIComponent(queryfilter);

  request(
    {
      url: queryurl
    },
    function(error, response, body) {
      debug('error: ', error);
      debug('body: %j', body);
      debug('response: %j', response);
      if (error) {
        cb(Error(error), null);
        return;
      }

      var catalogs;
      try {
        catalogs = JSON.parse(body);
      } catch (e) {
        cb(e, null);
        return;
      }
      debug('catalog returned: %j', catalogs);
      if (catalogs.length === 1) {
        cb(null, catalogs[0].name);
      } else {
        cb(null, null);
      }
    }
  );
}

function evalApikey(context, securityReq, securityDef, filters, callback) {
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
      grabAPI(context, function(err, apiDef) {
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

/**
 * Adds flow information from API in the context
 * @param {Object} context - context object
 * @param {callback} callback - The callback that handles the error
 *                              or output context
 */
function grabAPI(context, callback) {

  debug('grabAPI entry');
  var snapshotFilter = '{"snapshot-id": "' + context.context.snapshot + '"}';
  var apiFilter = '{"id": "' + context.context.api.id + '"}';
  var queryfilter =
    '{"where": { "and":[' +
    snapshotFilter + ',' +
    apiFilter + ']}}';
  var queryurl = 'http://' + host + ':' + port +
    '/api/apis?filter=' + encodeURIComponent(queryfilter);
  var api = {};

  request(
    {
      url : queryurl
    },
    function (error, response, body) {
      debug('error: ', error);
      debug('body: %j' , body);
      debug('response: %j' , response);
      if (error) {
        callback(error);
        debug('grabAPI error exit');
        return;
      }
      try {
        api = JSON.parse(body);
      } catch (e) {
        callback(e, null);
        return;
      }
      debug('grabAPI request exit');
      callback(null, api[0]); // there should only be one result
    }
  );
  debug('grabAPI exit');
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
 * @param {Object} opts.hdrAuthorization - authorization data from request header
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
  var orgName;
  var catName;

  if (uri.length > 1) {
    // extract org name
    orgName = uri[1];
    debug('orgName: ', orgName);

    if (uri.length > 2) {
      // extract catalog name. Note that this value may be omitted....
      catName = uri[2];
      debug('catName: ', catName);
    }
  }

  var inboundPath = (uri.length === 3) ? '/' : '';
  for (var i = 3; i < uri.length; i++) {
    inboundPath += '/' + uri[i];
  }

  var inboundPathAlt = (uri.length === 2) ? '/' : '';
  for (i = 2; i < uri.length; i++) {
    inboundPathAlt += '/' + uri[i];
  }

  debug('inboundPath: ', inboundPath);
  debug('grabFilters exit');

  return {hdrAuthorization: opts.hdrAuthorization,
          hdrClientId: opts.hdrClientId,
          hdrClientSecret: getHashedValue(opts.hdrClientSecret),
          qryClientId: opts.qryClientId,
          qryClientSecret: getHashedValue(opts.qryClientSecret),
          orgName: orgName,
          catName: catName,
          inboundPath: inboundPath,
          inboundPathAlt: inboundPathAlt,
          method: opts.method,
          response: opts.response};
}

/**
 * Builds context(s) based on matching data-store entries against request
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
function findContext(filters, body, contextsCB) {

  debug ('findContext entry');
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
  debug('listOfEntries %j', listOfEntries);
  async.forEach(listOfEntries,
    function(possibleEntryMatch, entriesListCB) {
      debug('possibleEntryMatch ', possibleEntryMatch);
      async.forEach(possibleEntryMatch['api-paths'],
        function(pathObject, entryMatchCB) {
          // get path match regular expression
          var path = pathObject['path-regex'];

          // use regular expression matching to see if there are any
          // APIs that match the request
          var re = new RegExp(path);
          var foundPath = re.test(filters.inboundPath);

          if (foundPath) { // path found...
            // now let's see if the Method exists
            var MatchingMethod =
              findMethodMatch(filters.method,
                              pathObject['path-methods']);
            if (Object.keys(MatchingMethod).length) { // found the method too..
              // Evaluate matches against the Swagger security refs and defs
              security.evalSecurity(possibleEntryMatch,
                MatchingMethod.securityReqs,
                MatchingMethod.securityDefs,
                filters,
                function(err, result) {
                  if (result) {
                    var match = buildPreflowContext(possibleEntryMatch,
                                pathObject.path,
                                MatchingMethod);
                    matches.push(match);
                  }
                  return entryMatchCB(err);
                });
            } else {
              entryMatchCB();
            }
          } else {
            entryMatchCB();
          }
        }, function(err) {
          entriesListCB(err);
        });
    }, function(err) {
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
    name: EntryMatch['plan-name']
  };
  var api = {
    id: EntryMatch['api-id'],
    basepath: EntryMatch['api-base-path'],
    path: PathMatch,
    method: MethodMatch.method,
    operationId: MethodMatch.operationId
  };
  var client = {
    app: {
      id: EntryMatch['client-id'],
      secret: EntryMatch['client-secret']
    }
  };
  var context = {
    context: {
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
