/**
 * Module dependencies
 */

var async = require('async');
var request = require('request');

/**
 * Module exports
 */
module.exports = {
    contextget: apimcontextget
};


/**
 * Module constants
 */

function apimcontextget (opts, cb) {

var matches = [];
var host = '127.0.0.1';
var port = '5000';

var clientID = opts.clientid;
console.log('clientID: ' + clientID);

var endOfOrgName = opts.path.indexOf('/', 1);
var orgName = opts.path.substring(1, endOfOrgName);
console.log('orgName: ' + orgName);

var endOfCatName = opts.path.indexOf('/', endOfOrgName+1);
var catName = opts.path.substring(endOfOrgName+1, 
					endOfCatName);
console.log('catName: ' + catName);


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
console.log('inboundPath: ' + inboundPath);

var clientIDFilter = '{%22client-id%22:%20%22' + clientID + '%22}';
var catalogNameFilter = '{%22catalog-name%22:%20%22' + catName + '%22}';
var organizationNameFilter = 
		'{%22organization-name%22:%20%22' + orgName + '%22}';
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
		console.log('error: ' + error);
                console.log('body: %j' , body);
                console.log('response: %j' , response);
		var listOfEntries = JSON.parse(body);
		async.each(listOfEntries, function(possibleEntryMatch, done) {
			async.each(possibleEntryMatch['api-paths'], function(pathObject, done) {	
				var path = pathObject.path;
				console.log('path: ' + pathObject.path);
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
				console.log('path after: ' + path);

				var re = new RegExp(path);
        			var found = re.test(inboundPath);

        			if (found) {
					var pathMethods = pathObject['path-methods'];
          				console.log('Path match found: ' + path);
					console.log('Path mthd: ' + JSON.stringify(pathMethods,null,4));
					console.log('method map: ' + JSON.stringify({method: opts.method}));
					async.each(pathMethods, 
						   function(possibleMethodMatch, done) {
						if (possibleMethodMatch.method === opts.method)
							{
							console.log('and method/verb matches!');
							var match = buildPreflowFormat(possibleEntryMatch,
										       pathObject.path,
										       possibleMethodMatch);
							matches.push(match);
							}
						else
							{
							console.log('no method/verb match though');
							}
						});
        				}
				});
			});
		cb(matches);
	}); 
}


function buildPreflowFormat(EntryMatch, PathMatch, MethodMatch) {
	
	var flow;
	if (EntryMatch.id % 2 === 1)
		{
		flow = {
      			assembly: {
        			execute: [{
          				'invoke-api': {
            					'target-url':
              					'http://127.0.0.1:8889/api1'
          					}
        				}]
      				}
    			};
		}
	else
		{
                flow = {
                        assembly: {
                                execute: [{
                                        'invoke-api': {
                                                'target-url':
                                                'http://127.0.0.1:8889/api2'
                                                }
                                        }]
                                }
                        };

		} 
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
        var body = {
		flow: flow,
		context: {
			catalog: catalog,
			organization: organization,
			product: product,
			plan: plan,
			api: api,
			client: client
			}
		};
	console.log('body: ' +  JSON.stringify(body,null,4));
	
	return body;
}
