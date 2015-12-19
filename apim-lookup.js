/**
 * Module dependencies
 */

var async = require('async');
var request = require('request');
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

var host = '127.0.0.1';
var port = '5000';


/**
 * 
 */

function apimcontextget (opts, cb) {
	
	var filters = grabFilters(opts);
	
	var clientIDFilter = '{%22client-id%22:%20%22' + filters.clientid + '%22}';
	var catalogNameFilter = 
		'{%22catalog-name%22:%20%22' + filters.catName + '%22}';
	var organizationNameFilter = 
			'{%22organization-name%22:%20%22' + filters.orgName + '%22}';
	var queryfilter = 
		'{%22where%22:%20{%20%22and%22:[' + 
			clientIDFilter + ',' + 
			catalogNameFilter + ',' + 
			organizationNameFilter + ']}}';
	var queryurl = 'http://' + host + ':' + port + 
			'/api/optimizedData?filter=' + queryfilter;
	
	request(
				{
				url : queryurl
				},
			function (error, response, body) {
				debug('error: ', error);
				debug('body: %j' , body);
				debug('response: %j' , response);
				if (error) {
					cb(error, undefined);
					return;
					}
				var localcontexts = [];
				localcontexts = findContext(filters, body);
				debug('contexts after findContext: %j' , localcontexts);
				addFlows(localcontexts, function (contexts)
					{
					debug('contexts: %j' , contexts);
					localcontexts = contexts;
					cb(null, localcontexts);
					});
				
			});
}

function addFlows(contexts, callback)
	{
	debug('addFlows top');
	debug('addFlows top contexts:', contexts);
	var localContexts = [];
	async.forEach(contexts, 
		function(context, callback) {
			debug('addFlows middle');
			debug('addFlows middle context:', context);
			grabAPI(context, function(err, apiDef) {
					context.flow = apiDef.document['x-ibm-configuration'];
					localContexts.push(context);
					debug('addFlows callback end');
					callback();
					});
		}, 
		function(err) {
			//if (err) return callback(err, null);
			//Tell the user about the great success
			debug('addFlows bottom1');
			callback(localContexts);
        });
		debug('addFlows bottom2');
		//callback(localContexts)
	}	
	
function grabAPI(context, callback) {
	debug('grabAPI top');
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
                api = JSON.parse(body);
				debug('grabAPI bottom');
				callback(null, api);
                });
	}
	
function grabFilters(opts)
	{
	var clientid = opts.clientid;
	debug('clientid: ', clientid);
	
	// extract org name
	var endOfOrgName = opts.path.indexOf('/', 1);
	var orgName = opts.path.substring(1, endOfOrgName);
	debug('orgName: ', orgName);
	
	// extract catalog name
	var endOfCatName = opts.path.indexOf('/', endOfOrgName+1);
	var catName = opts.path.substring(endOfOrgName+1, 
						endOfCatName);
	debug('catName: ', catName);
	
	
	// 
	var beginOfFilters = opts.path.indexOf('?', endOfCatName+1);
	var inboundPath;
	if (beginOfFilters > -1)
		{
		inboundPath = opts.path.substring(endOfCatName, beginOfFilters);
		}
	else
		{
		inboundPath = opts.path.substring(endOfCatName);
		}
	debug('inboundPath: ', inboundPath);
	
	return {clientid: opts.clientid, 
			orgName: orgName, 
			catName: catName, 
			inboundPath: inboundPath, 
			method: opts.method};
	}

function findContext(filter, body)
	{
	var matches = [];
	var listOfEntries = JSON.parse(body);
	async.each(listOfEntries, function(possibleEntryMatch, done) {
		async.each(possibleEntryMatch['api-paths'], function(pathObject, done) {	
			var path = findPathMatch(pathObject, possibleEntryMatch);

			var re = new RegExp(path); // reg expression test the path
			var foundPath = re.test(filter.inboundPath);
			
			if (foundPath) // path found... now let's see if the Method exists
				{
				var MatchingMethod = 
					findMethodMatch(filter, path, pathObject, possibleEntryMatch);
				if (MatchingMethod !== {}) // found the method too.. 
					{
					var match = buildPreflowFormat(possibleEntryMatch,
									pathObject.path,
									MatchingMethod);
					matches.push(match);
					}
				}
			});
		});
	return matches;
	}

function findPathMatch(pathObject, possibleEntryMatch)
	{
	var path = pathObject.path;
	debug('path: ' , pathObject.path);
	var braceBegin = -1;
	var braceEnd = -1;
	do {
		braceBegin = path.indexOf('{');
		if (braceBegin >= 0) {
			braceEnd = path.indexOf('}') + 1;
			var variablePath = path.substring(braceBegin, braceEnd);
			path = path.replace(variablePath, '.*');
			}
	} while (braceBegin >= 0);	
	path = '^' + possibleEntryMatch['api-base-path'] + path + '$';
	debug('path after: ', path);
	return path;	
	}

function findMethodMatch(filters, path, pathObject, possibleEntryMatch)
	{
	var pathMethods = pathObject['path-methods'];
	debug('Path match found: ', path);
	debug('Path mthd: ' , JSON.stringify(pathMethods,null,4));
	debug('method map: ' , JSON.stringify({method: filters.method}));
	async.each(pathMethods, 
		function(possibleMethodMatch, done) {
			if (possibleMethodMatch.method === filters.method)
				{
				debug('and method/verb matches!');
				return possibleMethodMatch;
				}
			else
				{
				debug('no method/verb match though');
				}
			});
		return {};
	}


	
function buildPreflowFormat(EntryMatch, PathMatch, MethodMatch, cb) {
	debug('begin buildPreflowFormat');

	var catalog = {
			id: EntryMatch['catalog-id'],
			name: EntryMatch['catalog-name']};
	var organization = {
			id: EntryMatch['organization-id'],
			name: EntryMatch['organization-name']};
	var product = {
			id: EntryMatch['product-id'],
			name: EntryMatch['product-name']};
	var plan = {
		id: EntryMatch['plan-id'],
		name: EntryMatch['plan-name'],
		};
	var api = {id: EntryMatch['api-id'],
		basepath: EntryMatch['api-base-path'],
		path: PathMatch,
		method: MethodMatch.method,
		operationId: MethodMatch.operationId
		};
	var client = {
		app: {
				id: EntryMatch['client-id'],
				secret: EntryMatch['client-secret']
		}};
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
	debug('buildPreflowFormat context: ', context);

	debug('end buildPreflowFormat');
	return context;
	}
