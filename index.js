/*
 * Populate APIm context and determine the API swagger based
 * on the clientID, http method, and URI
 */
'use strict';
var debug = require('debug')('strong-gateway:preflow');

module.exports = function createPreflowMiddleware(options) {
  debug('configuration', options);

  // TODO - assembly is currently hardcoded.
  // To be replaced with file or Jon's config-mgmt model

  return function preflow(req, res, next) {
    // if the URL doesn't being with /apim, then skip the preflow
    // the reason is not to break existing StrongGateway's test cases
    if (req.originalUrl.search(/^\/apim\//) === -1) {
      debug('Skip ' + req.originalUrl + ' non-apim traffics');
      next();
      return;
    }

    // Call a Mock function to get the clientId - always uses URL param.
    // - creates a json object and calls it 'context', adds it to req
    // - gets clientId from url param and places it in context.clientId
    mockFetchClientId(req);

    var ctx = req.ctx;

//    var assembly =
//        'assembly:\n' +
//        '  execute:\n' +
//        '    - invoke-api:\n' +
//        '        target-url: "http://$(target-host)/$(request.path)"\n'+
//        '        verb: $(request.verb)\n';
//
//    ctx.set('flowAssembly', require('yamljs').parse(assembly));
//    ctx.set('target-host', 'http://9.42.102.139:3030');
//    ctx.set('request.path', req.originalUrl);
//    ctx.set('request.verb', req.method);

    var apis = mockResourceLookup(req.originalUrl,
                                  req.method,
                                  ctx.get('client-id'));

    if (apis.length === 1) {
      ctx.set('flowAssembly', apis[0].flow);
      ctx.set('target-host', 'http://9.42.102.139:3030'); // TODO: real env
      ctx.set('request.path', req.originalUrl);           // TODO: real env
      ctx.set('request.verb', req.method);                // TODO: real env

      ctx.set('api', apis[0].context.api);
      ctx.set('plan', apis[0].context.plan);
      ctx.set('client', apis[0].context.client);
    } else if (apis.length === 0) {
      // TODO: Do something here to indicate a 404
      debug('No APIs found');

    } else {
      debug('Multiple API matches found: ', apis.length);
      // More than one matching API was returned, get the right one, these
      // headers may help
      //X-IBM-Plan-Id
      //X-IBM-Plan-Version
      //X-IBM-Api-Version
      var planId = req.headers['x-ibm-plan-id'];
      var planVersion = req.headers['x-ibm-plan-version'];
      var matchFound = false;
      for (var i=0; i < apis.length; i++) {
        if (apis[i].context.plan.planId === planId &&
            apis[i].context.plan.version === planVersion) {
          ctx.set('flowAssembly', apis[i].flow);
          ctx.set('target-host', 'http://9.42.102.139:3030'); // TODO: real env
          ctx.set('request.path', req.originalUrl);           // TODO: real env
          ctx.set('request.verb', req.method);                // TODO: real env

          ctx.set('api', apis[i].context.api);
          ctx.set('plan', apis[i].context.plan);
          ctx.set('client', apis[i].context.client);
          matchFound = true;
          break;
        }
      }
      if (matchFound === false) {
        // TODO: Do something here to indicate a 404
        debug('No APIs found based on header match');
      }
    }

    next();
  };
};

/**
 * Function that creates a mock context and adds clientId to it
 */
function mockFetchClientId(req) {

  var ctx = req.ctx;

  var clientId = req.query['client_id'];
  console.log('Client Id: ' + clientId);
  ctx.set('client-id', clientId);
  console.log('Return');
}

/**
 * Function that returns mock API info
   - Jon and Jeremy will write the real implementation later
   Usage:
     ClientID=123098456765 returns one API
     ClientID=123098456766 returns two APIs
     all other clientIDs return no APIs
 */
function mockResourceLookup(url, method, clientId) {
  var matchingApis = [];
  var api1 = {
    flow: {
      assembly: {
        execute: [{
          'invoke-api': {
            'target-url':
              'http://127.0.0.1:8889/api1'
          }
        }]
      }
    },
    context: {
      api: {
        id: '343543622',
        basepath: '/v1',
        properties: {LDAP: 'bluepages.ibm.com'},
        operationId: 'routeAdd',
        path: '/route/{route}',
        method: 'POST'
      },
      plan: {
        planId: '908422812349',
        version: '1.0',
        name: 'gold',
        'rate-limit': '10/sec'
      },
      client: {
        app: {
          id: '123098456765',
          secret: 'blah-blah-secret'
        }
      }
    }
  };

  var api2 = {
    flow: {
      assembly: {
        execute: [{
          'invoke-api': {
            'target-url':
              'http://127.0.0.1:8889/api2'
          }
        }]
      }
    },
    context: {
      api: {
        id: '343543622',
        basepath: '/v1',
        properties: {LDAP: 'bluepages.ibm.com'},
        operationId: 'routeAdd',
        path: '/route/{route}',
        method: 'POST'
      },
      plan: {
        planId: '908422812349',
        version: '2.0',
        name: 'gold',
        'rate-limit': '10/sec'
      },
      client: {
        app: {
          id: '123098456765',
          secret: 'blah-blah-secret'
        }
      }
    }
  };

  if (clientId === '123098456765' || clientId === '123098456766') {
    matchingApis.push(api1);
  }
  if (clientId === '123098456766') {
    matchingApis.push(api2);
  }
  return matchingApis;
}
