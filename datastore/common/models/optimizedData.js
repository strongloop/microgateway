var _ = require('lodash');
var async = require('async');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore:optimizedData'});
var jsonRefs = require('json-refs');

var ALLPLANS = 'ALLPLANS';
function createProductOptimizedEntry(app, ctx)
  {
  var locals = {};
  var product = ctx.instance
  locals.snapshot = ctx.instance['snapshot-id'];
  locals.subscription = {};  /// no subscription
  // assume we are going to create a wildcard entry...
  //     We will not if there's security configured at api level..
  locals.application = {
      title: '',
      credentials: [{'client-id' : '', 'client-secret': ''}],
      developerOrg: {
        id: '',
        name: ''
      }
    };
  var isWildcard = true;
  cycleThroughPlansInProduct(app, locals, isWildcard, product, ALLPLANS);
  }

function cloneJSON(json) {
  return JSON.parse(JSON.stringify(json));
}

function cycleThroughPlansInProduct(app, locals, isWildcard, product, planid, productCallback)
  {
  var plans = cloneJSON(product.document.plans);
  async.forEachLimit(Object.getOwnPropertyNames(plans),1,
    function(propname, propCallback)
      {
      //overwrite with specific entry
      locals.catalog = {};
      locals.product = product;
      locals.plan = {};
      locals.plan.apis = product.document.plans[propname].apis;
      if (_.isEmpty(locals.plan.apis)) { // all product apis scenario
        locals.plan.apis = product.document.apis;
        logger.debug("1. all product apis in plan... APIs: " + product.document.apis);
        }
      locals.plan.name = propname;
      locals.plan.id = getPlanID(locals.product, propname);
      locals.plan.version = locals.product.document.info.version;
      locals.plan.rateLimit =
        locals.product.document.plans[locals.plan.name]['rate-limit'];
      // 1. trying to add to a particular plan
      // 2. trying to add to all plans
      //    a. all subscription
      //    b. product that possibly doesn't have subs or security
      if (planid === ALLPLANS || locals.plan.id === planid)
        {
        gatherDataCreateOptimizedEntry(app, locals, isWildcard, propCallback);
        }
      else
        {
        propCallback();
        }
      });
  if (productCallback)
    productCallback();
  }

function determineNeededSubscriptionOptimizedEntries(app, ctx)
  {
  var locals;
  locals = ripCTX(ctx);
  if (!process.env.APIMANAGER)
    {
    var planid = ctx.instance['plan-registration'].id;
    findPlansToAddSubscriptions(app, locals, planid)
    }
  else
    {
    //specific subscription from APIm
    var isWildcard = false
    gatherDataCreateOptimizedEntry(app, locals, isWildcard);
    }
  }

function findPlansToAddSubscriptions(app, passed, planid)
  {
  var isWildcard = false;
  var locals = passed;
  var productquery = {}; // look at all products
  // find optimized entries to create
  app.models.product.find(productquery, function(err, products) {
    async.forEach(products,
      function (product, productCallback)
      {
      cycleThroughPlansInProduct(app, locals, isWildcard, product, planid, productCallback);
      });
    });
  }

function ripCTX(ctx)
  {
  var locals = {};
  locals.subscription = {};
  locals.subscription.id = ctx.instance.id;
  locals.application = {
    title: ctx.instance.application.title,
    credentials: ctx.instance.application['app-credentials'],
    developerOrg: ctx.instance['developer-organization']
  };
  ctx.instance['plan-registration'].apis = {}; // old list, wipe it
  locals.product = ctx.instance['plan-registration'].product;
  locals.plan = {};
  if (ctx.instance['plan-registration'].plan) {
    locals.plan.name = ctx.instance['plan-registration'].plan.name;
    locals.plan.title = ctx.instance['plan-registration'].plan.title;
  }
  if (locals.product)
    {
    locals.plan.apis = locals.product.document.plans[locals.plan.name].apis;
    if (_.isEmpty(locals.plan.apis)) { // all product apis scenario
      locals.plan.apis = locals.product.document.apis;
      logger.debug("2. all product apis in plan... APIs: " + locals.product.document.apis);
      }
    locals.plan.id = getPlanID(locals.product, locals.plan.name);
    locals.plan.version = locals.product.document.info.version;
    locals.plan.rateLimit =
      locals.product.document.plans[locals.plan.name]['rate-limit'];
    }
  locals.snapshot = ctx.instance['snapshot-id'];
  return locals;
  }

function getPlanID(product, planname)
  {
  logger.debug('product.document.info.name + ":" + product.document.info.version + ":" + planname: ' +
    JSON.stringify(product.document.info.name + ":" + product.document.info.version + ":" + planname, null, 4));
  return product.document.info.name + ":" + product.document.info.version + ":" + planname;
  }

function gatherDataCreateOptimizedEntry(app, locals, isWildcard, gatherCallback)
  {
  async.series(
    [
      function(callback) {
        grabCatalog(app,
          locals.snapshot,
          locals.product,
          function(err, catalog) {
            if (err) {
              callback(err);
              return;
            }
            locals.catalog = catalog;
            callback();
          }
        );
      },
      function(callback) {
        grabOrg(app,
          locals.snapshot,
          locals.catalog,
          function(err, org) {
            if (err) {
              callback(err);
              return;
            }
            locals.org = org;
            callback();
          }
        );
      },
      function(callback) {
        grabAPIs(app,
          locals.snapshot,
          locals.product,
          locals.plan,
          function(err, apis) {
            if (err) {
              callback(err);
              return;
            }
            locals.apis = apis;
            callback();
          }
        );
      },
      function(callback) {
        annotateAPIs(locals.apis,
          function(err) {
            callback(err);
          }
        );
      },
      function(callback) {
        createOptimizedDataEntry(
          app,
          locals,
          isWildcard,
          function(err) {
            if (err) {
              callback(err);
              return;
            }
            callback();
          }
        );
      }
    ],
    function(err, results) {
      if (err) {
        logger.error(err);
      }
      if (gatherCallback)
        gatherCallback();
    }
  );
}

function grabCatalog(app, snapshot, product, cb) {
  var catalog = {};
  var query = {
    'where' : {
        'snapshot-id' : snapshot,
        'id' : product.id
    }
  };
  app.models.product.findOne(query, function(err, myproduct) {
      if (err) {
        cb(err);
        return;
      }
      logger.debug('grabCatalog found: %j', myproduct);
      catalog = myproduct.catalog;
      cb(null, catalog);
    }
  );
}


function grabOrg(app, snapshot, catalog, cb) {
  var org = {};
  var query = {
    'where' : {
        'snapshot-id' : snapshot,
        'id' : catalog.id
    }
  };
  app.models.catalog.findOne(query, function(err, mycatalog) {
      if (err) {
        cb(err);
        return;
      }
      logger.debug('grabOrg found: %j', mycatalog);
      if (mycatalog)
        org = mycatalog.organization;
      else {org={};}
      cb(null, org);
    }
  );
}


function grabAPIs(app, snapshot, product, plan, cb) {
  var apis = [];
  logger.debug('got product: %j', product);
  logger.debug('got plan: %j', plan);
  var planApis = cloneJSON(plan.apis);
  logger.debug('planApis: %j', planApis);
  logger.debug('planApiProps: %j', Object.getOwnPropertyNames(planApis));

  async.each(
    Object.getOwnPropertyNames(planApis),
    function(api, done) {
      var query = {
        'where' : {
          'snapshot-id' : snapshot
        }
      };
      var info = {};
      if (product.document.apis[api].info) {// standard (not in document)
        logger.debug('info: product.document.apis[api].info');
        info = product.document.apis[api].info;
        }
      else
        {
        // not resolved try to spit the name
        logger.debug('api: %j', api);
        var apiName = product.document.apis[api].name.split(':');
        logger.debug('apiName: %j', apiName);
        logger.debug('info: product.document.apis[api][name]');
        info = {'x-ibm-name': apiName[0], 'version': apiName[1]}
        }

      logger.debug('info: %j', info);
      app.models.api.find(
        query,
        function(err, listOfApis) {
          if (err) {
            done(err);
            return;
          }
          listOfApis.forEach(function(DBapi) {
            logger.debug('DBapi.document.info: %j', DBapi.document.info);
            if (DBapi.document.info.version ===
              info.version &&
              DBapi.document.info['x-ibm-name'] ===
              info['x-ibm-name']) {
                logger.debug('found api in db: %j', DBapi);
                // need to stringify API as we need to add metadata to it
                // and not changing the underlying model
                apis.push(cloneJSON(DBapi));
                }

          });
          done();
        }
      );
    },
    function(err) {
      cb(err, apis);
    }
  );
}

/**
 * Add additional metadata to the API object, the following metadata
 * will be added in this function:
 *  - 'document-resolved':  store the swagger after resolving JSON refs
 *  - 'document-wo-assembly': store the swagger w/o assembly data
 *
 * @param {Array} listOfApis is an array of API object
 * @param {Function} callback is called after annotation is done
 */
function annotateAPIs(listOfApis, callback) {
  logger.debug('annotate API metadatas');

  async.each(listOfApis,
    function(api, next) {
      // populate 'document-wo-assembly'
      // Some customers add their own extension to the swagger,
      // so we will make the swagger available in context to customers.
      var swaggerWithoutAssembly = cloneJSON(api.document);
      delete swaggerWithoutAssembly['x-ibm-configuration'].assembly;
      api['document-wo-assembly'] = swaggerWithoutAssembly;

      // populate 'document-resolved'
      jsonRefs.resolveRefs(api.document)
        .then(function(res) {
          // saved the resolved swagger document if any JSON ref in it;
          if (Object.keys(res.refs).length > 0) {
            logger.debug('store resolved API swagger document');
            api['document-resolved'] = res.resolved;
          }
        }, function(err) {
          // error when resolving json-refs
          logger.debug('error when resolving JSON references: %j', err);
        })
        .then(next, next); // end of jsonRefs promise resolution
    },
    function(err) {
      logger.debug('All API swaggers have been annotated');
      callback(err);
    }
  ); // end of async.each() call
}

function createOptimizedDataEntry(app, pieces, isWildcard, cb) {
  async.each(
    pieces.application.credentials,
    function(credential, creddone) { //each clientid
      async.each(
        pieces.apis,
        function(api, apidone) {  // each api
          var apiPaths = [];

          // use JSON-ref resolved document if available
          var apiDocument = api['document-resolved'] || api.document;

          var pathsProp = apiDocument.paths;
          logger.debug('pathsProp ' +
                Object.getOwnPropertyNames(pathsProp));
          Object.getOwnPropertyNames(pathsProp).forEach(
            function(propname) {
              var method = [];
              if (propname.indexOf('/') > -1) {
                logger.debug('propname: ' + propname);
                var propnames = apiDocument.paths[propname];
                Object.getOwnPropertyNames(
                  propnames).forEach(
                  function(methodname) {
                    var operation = propnames[methodname];
                    logger.debug('propname method: %j',
                      methodname);
                    logger.debug('propname operationId: %j',
                      operation.operationId);
                    var securityEnabledForMethod =
                      operation.security ? operation.security : apiDocument.security;
                    logger.debug('securityEnabledForMethod: %j', securityEnabledForMethod);

                    var allowOperation = false;
                    var observedRatelimit = pieces.plan.rateLimit;
                    var rateLimitScope = pieces.plan.id;
                    // Does the plan neglect to specify APIs, or is the api listed in the plan with no operations listed? Then allow any operation
                    if ((pieces.plan.apis === undefined) || 
                        (pieces.plan.apis[api.document.info['x-ibm-name']] !== undefined && 
                         pieces.plan.apis[api.document.info['x-ibm-name']].operations === undefined)){
                      allowOperation = true;
                    } else {
                      //Look to see if we got an operationID match
                      var operations = pieces.plan.apis[api.document.info['x-ibm-name']].operations;
                      var loop_index;

                      operations.forEach(function(planOp) {
                        var opId = planOp.operationId;
                        var opMeth = planOp.operation;
                        var opPath = planOp.path;
                        
                        if ((opId !== undefined && opId === operation.operationId) || 
                              (opMeth !== undefined && opPath !== undefined &&
                               opMeth.toUpperCase() === methodname.toUpperCase() && 
                               opPath.toUpperCase() === propname.toUpperCase())) {
                          allowOperation = true;
                          // Look for some operation scoped ratelimit metadata
                          if (planOp["rate-limit"] !== undefined) {
                            observedRatelimit=planOp["rate-limit"];

                            if (opId) {
                              rateLimitScope = pieces.plan.id+":"+opId;
                            } else {
                              rateLimitScope = pieces.plan.id+":"+opMeth+":"+opPath;
                            }
                          }
                        }
                      });
                    }

                    var clientidSecurity = false;
                    if (securityEnabledForMethod)
                      {
                      securityEnabledForMethod.forEach(
                        function(securityReq) {
                            var securityProps = Object.getOwnPropertyNames(securityReq)
                            securityProps.forEach(
                              function(securityProp) {
                                if (apiDocument.securityDefinitions &&
                                    apiDocument.securityDefinitions[securityProp] &&
                                    apiDocument.securityDefinitions[securityProp].type === 'apiKey')
                                  clientidSecurity = true;
                                  logger.debug('clientidSecurity: ' + clientidSecurity);
                                });
                        });
                      }
                    if (allowOperation && 
                        ((securityEnabledForMethod && clientidSecurity && !isWildcard) ||
                        // add only security for subscriptions
                        ((!securityEnabledForMethod || !clientidSecurity) && isWildcard))) {
                        // add only non-clientid security for products (wildcard)
                      method.push({
                        consumes: operation.consumes || apiDocument.consumes,
                        method: methodname.toUpperCase(),
                        operationId: operation.operationId,
                        parameters: getOpParams(apiDocument.paths[propname].parameters,
                                                operation.parameters),
                        produces: operation.produces || apiDocument.produces,
                        responses: operation.responses,
                        securityDefs: apiDocument.securityDefinitions,
                        // operational lvl Swagger security overrides the API lvl
                        securityReqs: securityEnabledForMethod,
                        'observed-rate-limit': observedRatelimit,
                        'rate-limit-scope': rateLimitScope
                        });
                      }
                  }
                );
                if (method.length !== 0) { // no methods, no apiPaths
                  var regexPath = makePathRegex(
                            apiDocument.basePath,
                            propname);
                  var apiPath = {
                    path: propname,
                    'matching-score':
                      calculateMatchingScore(propname),
                    'path-regex': regexPath,
                    'path-methods': method
                    };
                  apiPaths.push(apiPath);
                  }
              }
            }
          );

          // get API properties that user defined in the swagger
          var ibmSwaggerExtension = apiDocument['x-ibm-configuration'];
          var defaultApiProperties = ibmSwaggerExtension.properties;
          var apiProperties = {};
          if (defaultApiProperties) {
            Object.getOwnPropertyNames(defaultApiProperties).forEach(
              function(propertyName){
                if (pieces.catalog.name &&
                    ibmSwaggerExtension.catalogs[pieces.catalog.name] &&
                    ibmSwaggerExtension.catalogs[pieces.catalog.name].properties[propertyName]) {
                  apiProperties[propertyName] = ibmSwaggerExtension.catalogs[pieces.catalog.name].properties[propertyName];
                } else {
                  apiProperties[propertyName] = defaultApiProperties[propertyName];
                }
              }
            );
          }

    /*
        "subscription-id": "string",
        "client-id": "string",
        "catalog-id": "string",
        "catalog-name": "string",
        "organization-id": "string",
        "organization-name": "string",
        "product-id": "string",
        "product-name": "string",
        "plan-id": "string",
        "plan-name": "string",
        "plan-rate-limit": {},
        "api-id": "string",
        "api-base-path": "string",
        "api-name": "string",
        "api-version": "string",
        "api-properties": {},
        "api-paths": [{
           "path": "string",
           "path-base": "string",
           "path-methods": [
              ]
          }],
         TODO: "snapshot-id": "string"
        */
          if (logger.debug()) {
            logger.debug('pieces: %s', JSON.stringify(pieces, null, 4));
          }
          var newOptimizedDataEntry = {
            'subscription-id': pieces.subscription.id,
            'client-id': credential['client-id'],
            'client-secret': credential['client-secret'],
            'client-name': pieces.application.title,
            'client-org-id': pieces.application.developerOrg ?
              pieces.application.developerOrg.id : '',
            'client-org-name': pieces.application.developerOrg ?
              pieces.application.developerOrg.name : '',
            'plan-id': pieces.plan.id,
            'plan-name': pieces.plan.name,
            'plan-version': pieces.plan.version,
            'plan-rate-limit': pieces.plan.rateLimit,
            'product-id': pieces.product.id,
            'product-name': pieces.product.document.info.name,
            'catalog-id': pieces.catalog.id,
            'catalog-name': pieces.catalog.name,
            'organization-id': pieces.org.id,
            'organization-name': pieces.org.name,
            'api-id': api.id,
            'api-document': api['document-wo-assembly'],
            'api-document-resolved': api['document-resolved'],
            'api-assembly': {
                assembly: apiDocument['x-ibm-configuration'].assembly
              },
            'api-base-path': apiDocument.basePath,
            'api-name': apiDocument.info.title,
            'api-type': apiDocument['x-ibm-configuration']['api-type'] || 'REST',
            'api-version': apiDocument.info.version,
            'api-properties': apiProperties,
            'api-paths': apiPaths,
            'snapshot-id' : pieces.snapshot
          };

        if (apiPaths.length !== 0) { // no paths, no entry..
          app.models.optimizedData.create(
            newOptimizedDataEntry,
            function(err, optimizedData) {
              if (err) {
                apidone(err);
                return;
              }
              logger.debug('optimizedData created: %j',
                  optimizedData);
              apidone();
            }
          );
          }
        else {
          apidone();
          }
        },
        function(err) {
          creddone(err);
        }
      );
    },
    function(err) {
      cb(err);
    }
  );
}

function makePathRegex(basePath, apiPath) {
  var path = apiPath;
  logger.debug('path: ', path);
  var braceBegin = -1;
  var braceEnd = -1;
  do {
    braceBegin = path.indexOf('{');
    if (braceBegin >= 0) {
      braceEnd = path.indexOf('}') + 1;
      var variablePath = path.substring(braceBegin, braceEnd);
      path = path.replace(variablePath, ".+");
    }
  } while (braceBegin >= 0);
  path = '^' + basePath + path + '$';
  logger.debug('path after: ', path);
  return path;
}

function calculateMatchingScore(apiPath) {
  var pathArray = apiPath.split('/');
  var pathScore = 0;
  for (var i=0; i < pathArray.length; i++) {
    if (pathArray[i].indexOf('{') >= 0) {
      pathScore += Math.pow((pathArray.length - i), 2);
    }
  }

  return pathScore;
}

/**
 * Returns a Object that denotes the parameters associated with the operation
 *
 * @param {Array} pathParams path-level parameters in the swagger
 * @param {Array} opParams op-level perameters in the swagger
 *
 */
function getOpParams(pathParams, opParams) {
  var unionParams = _.unionWith(opParams, pathParams, opParamComparator);
  return unionParams;
}

/**
 * Returns true if two parameter definition is the same.
 * Parameters defined in operation overwrites the ones defined in path level.
 *
 * @param {Object} opParam a operation-level API parameter
 * @param {Object} pathParam a path-level API parameter
 */
function opParamComparator(opParam, pathParam) {
  return (opParam.name === pathParam.name);
}

exports.determineNeededSubscriptionOptimizedEntries = determineNeededSubscriptionOptimizedEntries;
exports.createProductOptimizedEntry = createProductOptimizedEntry;
