/**
 * Module dependencies
 */

var async = require('async');
var request = require('request');
var url = require('url');
var debug = require('debug')('strong-gateway:preflow');

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
var port = '5000';      // data-store's listening port


/**
 * Builds context object based on request options and data-store models
 * @param {Object} opts - request options
 * @param {string} opts.clientid - client ID of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @param {callback} cb - The callback that handles the error or output context
 */
function apimcontextget (opts, cb) {
    // extract filters from request
    var filters = grabFilters(opts);

    // build request to send to data-store
    var clientIDFilter = '{"client-id": "' + filters.clientid + '"}';
    var catalogNameFilter =
        '{"catalog-name": "' + filters.catName + '"}';
    var organizationNameFilter =
        '{"organization-name": "' + filters.orgName + '"}';
    var queryfilter =
        '{"where": { "and":[' +
        clientIDFilter + ',' +
        catalogNameFilter + ',' +
        organizationNameFilter + ']}}';
    var queryurl = 'http://' + host + ':' + port +
        '/api/optimizedData?filter=' +
        encodeURIComponent(queryfilter);

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
                cb(error, undefined);
                return;
            }
            // build context(s) of matching APIs
            var localcontexts = [];
            localcontexts = findContext(filters, body);
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

/**
 * Finds the default catalog/environment for a specific provider organization
 * @param {string} orgName - Name or provider organization
 * @param {callback} cb - The callback that handles the error or output context
 */
function apimGetDefaultCatalog(orgName, cb) {
    var orgNameFilter = '{%22organization.name%22:%20%22' + orgName + '%22}';
    var defaultOrgFilter = '{%22default%22:%20%22true%22}';
    var queryfilter =
        '{%22where%22:%20{%20%22and%22:[' +
        orgNameFilter + ',' +
        defaultOrgFilter + ']}}';
    var queryurl = 'http://' + host + ':' + port +
        '/api/catalogs?filter=' + queryfilter;

    request(
        {
            url: queryurl
        },
        function(error, response, body) {
            debug('error: ', error);
            debug('body: %j', body);
            debug('response: %j', response);
            if (error) {
                cb(error, undefined);
                return;
            }

            var catalogs = JSON.parse(body);
            debug('catalog returned: %j', catalogs);
            if (catalogs.length === 1) {
                cb(null, catalogs[0].name);
            } else {
                cb(null, undefined);
            }
        }
    );
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
            });
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
    var queryurl = 'http://' + host + ':' + port +
            '/api/apis/' + context.context.api.id;
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
            api = JSON.parse(body);
            debug('grabAPI request exit');
            callback(null, api);
        }
    );
    debug('grabAPI exit');
}

/**
 * Extracts client ID, organization, catalog, method and remaining path
 * @param {Object} opts - request options
 * @param {string} opts.clientid - client ID of request
 * @param {string} opts.path - request URI
 * @param {string} opts.method - HTTP request method
 * @returns {Object} - object containing client ID, org, catalog, method & path
 */
function grabFilters(opts) {

    debug('grabFilters entry');
    debug('clientid: ', opts.clientid);

    var parsedUrl = url.parse(opts.path, true /* query string */);
    var uri = parsedUrl.pathname.split('/');
    var orgName;
    var catName;

    if (uri.length > 1) {
        // extract org name
        orgName = uri[1];
        debug('orgName: ', orgName);

        if (uri.length > 2) {
            // extract catalog name
            catName = uri[2];
            debug('catName: ', catName);
        }
    }

    var inboundPath = (uri.length === 3) ? '/' : '';
    for (var i = 3; i < uri.length; i++) {
        inboundPath += '/' + uri[i];
    }
    debug('inboundPath: ', inboundPath);
    debug('grabFilters exit');

    return {clientid: opts.clientid,
            orgName: orgName,
            catName: catName,
            inboundPath: inboundPath,
            method: opts.method};
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
function findContext(filter, body) {

    debug ('findContext entry');
    // loop through each API maching the initial filters trying to
    // find the minimal set of ultimately matching APIs
    var matches = [];
    var listOfEntries = JSON.parse(body);
    debug('listOfEntries %j', listOfEntries);
    listOfEntries.forEach(function(possibleEntryMatch) {
        debug('possibleEntryMatch ', possibleEntryMatch);
        possibleEntryMatch['api-paths'].forEach(function(pathObject) {
            // build path match regular expression
            var path = buildPathMatch(
                           pathObject.path,
                           possibleEntryMatch['api-base-path']);

            // use regular expression matching to see if there are any
            // APIs that match the request
            var re = new RegExp(path);
            var foundPath = re.test(filter.inboundPath);

            if (foundPath) { // path found...
                // now let's see if the Method exists
                var MatchingMethod =
                    findMethodMatch(filter.method,
                                    pathObject['path-methods'],
                                    possibleEntryMatch.method);
                if (MatchingMethod !== {}) { // found the method too..
                    var match = buildPreflowContext(possibleEntryMatch,
                                    pathObject.path,
                                    MatchingMethod);
                    matches.push(match);
                }
            }
        });
    });

    debug ('findContext exit');
    return matches;
}

/**
 * Builds a regular expression of the API path to match
 * @param {string} origPath - OpenAPI spec's API path
 * @param {string} basePath - OpenAPI spec's API base path
 * @returns {string} - regular expression string to match against
 */
function buildPathMatch(origPath, basePath) {

    debug('buildPathMatch entry');
    debug('path: ' , origPath);
    var path = origPath;
    var braceBegin = -1;
    var braceEnd = -1;
    // replace path templates w/ wildcards
    do {
        braceBegin = path.indexOf('{');
        if (braceBegin >= 0) {
            braceEnd = path.indexOf('}') + 1;
            var variablePath = path.substring(braceBegin, braceEnd);
            path = path.replace(variablePath, '.*');
        }
    } while (braceBegin >= 0);
    path = '^' + basePath + path + '$';
    debug('path after: ', path);
    debug('buildPathMatch exit');
    return path;
}

/**
 * Find the API matching the request HTTP method
 * @param {string} filterMethod - HTTP method of request
 * @param {Object} pathMethods - array of HTTP methods for matched API
 * @param {string} possibleEntryMatchMethod - HTTP method
 * @returns {Object} - matching method or empty object (on no match)
 */
function findMethodMatch(filterMethod,
                         pathMethods,
                         possibleEntryMatchMethod) {

    debug('findMethodMatch entry');
    debug('Path methods: ' , JSON.stringify(pathMethods,null,4));
    debug('method map: ' , JSON.stringify({method: filterMethod}));
    pathMethods.forEach(function(possibleMethodMatch) {
        if (possibleEntryMatchMethod === filterMethod) {
            debug('and method/verb matches!');
            debug('findMethodMatch exit');
            return possibleMethodMatch;
        }
    });
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
