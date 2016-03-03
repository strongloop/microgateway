// populate the APIm context variables

'use strict';

//
// third-party module dependencies
//
var url      = require('url');
var csvParser= require('csv-parse');
var debug    = require('debug')('micro-gateway:preflow:context-populate');


/**
 * @param {Object} api the API object of this request
 * @param {Object} ctx the context object
 * @param {Object} req the express request object
 *
 * @returns the updated context object
 */
module.exports = function populateAPImCtx(api, ctx, req) {
  return new Promise((resolve, reject) => {
    // _ denotes internal variables
    ctx.set('_.assembly', api.flow);
    ctx.set('_.api', api._);

    ctx.set('config-snapshot-id', api.snapshot);
    ctx.set('api', api.api);
    ctx.set('client', api.client);
    ctx.set('client.app.secret', ctx.get('hdr-client-secret') ||
      ctx.get('qry-client-secret'));
    ctx.set('env', api.env);
    ctx.set('plan', api.plan);

    setEndPoint(ctx, req);

    // Duplicate api.properties.* to context
    copyAPIProperties(ctx);

    // Fill in ctx.request.parameters here
    parseParameters(ctx, req)
    .then(output => {
      debug("Set request.parametrs: ", output);
      ctx.set('request.parameters', output);

      resolve(ctx);
    }, error => {
      debug("parseParameters error: ", error);
      reject(error);
    });
  });
};


/**
 * Sets api.endpoint properties to the context object
 *
 * @param {Context} the APIm context object
 * @param {Request} the express request object
 */
function setEndPoint(context, req) {
  context.define('api.endpoint.address', function() {
    return req.socket.address().address;    
  }, false);

  context.define('api.endpoint.hostname', function() {
    return url.parse('//' + req.get('host'), false, true).hostname;
  });
}

/**
 * Set request.parameters to the context object. You can access parameter by
 * $(request.parameters.{name}
 *
 * @param {Context} the APIm context object
 * @param {Request} the express request object
 * @return Object, key is parameter name, value is parameter value.
 *        {
 *          "param1": "value1",
 *          "param2": 9999
 *        }
 *        key MUST be String.
 *        value MUST be string, number, integer, boolean, array, file(?)
 */
function parseParameters(ctx, req) {
  debug('parseParameters start.');

  //  Parameter definition is retrieved from ctx.get('_.api.parameters')
  //  _.api.parameters = [
  //      { name: 'opname',
  //        in:   'path',
  //        type: 'string',
  //        required: true },
  //      { name: 'save',
  //        in:   'query',
  //        type: 'boolean',
  //        required: true },
  //  ]
  var paramArray = ctx.get('_.api.parameters');
  var reqPath    = ctx.get('_.api.path');
  var basePath   = ctx.get('api.document.basePath');
  var urlParsedResult = url.parse(req.originalUrl, true);
  var headers    = req.headers;

  debug("paramArray: ", paramArray);
  debug("basePath: ", basePath);
  debug("request path: ", reqPath);
  debug("request originalUrl: ", req.originalUrl);
  debug("request headers: ", headers);

  // Process Path Template first. Create Path Template name and order object:
  // {
  //      "param4": 1
  //      "param3": 2
  // }
  // Execute regexp.exec() to get grouping result array:
  // ["/context/request/parameters/{param4}/{param3}", "abc", 9999]
  var pathTemplate = {};
  var pattern = makePathRegex(basePath, reqPath, pathTemplate);
  var pathTemplateResult = (new RegExp(pattern)).exec(urlParsedResult.pathname);
  debug("pathTemplate: ", pathTemplate);
  debug("pathTemplateResult: ", pathTemplateResult);

  return new Promise((resolve, reject) => {
    Promise.all(paramArray.map( elem => {
      var loc  = elem["in"];
      var name = elem.name;
      debug("parameter: ", elem);
      switch (loc) {
        case 'query':
          // urlParsedResult is the same as req.query
          return convertToType(urlParsedResult.query[name], elem)
          .then((output) => {
            return ({name: name, value: output});
          });
          break;
        case 'path':
          if (pathTemplate[name]) {
            return convertToType(pathTemplateResult[pathTemplate[name]], elem)
            .then((output) => {
              return ({name: name, value: output});
            });
          } else {
            //TODO: error handling
            return convertToType(undefined, elem)
            .then((output) => {
              return ({name: name, value: output});
            })
            /*console.error("The parameter "+name+" is in 'path', it MUST exist in Path Template.");
            var e = new Error("If the parameter"+name+" is in 'path', it MUST exist in Path Template.");
            reject(e);*/
          }
          break;
        case 'header':
          // header is lower case.
          var lowercase = name.toLowerCase();
          // if header is not existed, return undefined;
          return convertToType(headers[lowercase], elem)
          .then((output) => {
            return ({name: name, value: output});
          });
          break;
        case 'body':
          //TODO: error handling
          return convertToType(undefined, elem)
          .then((output) => {
            return ({name: name, value: output});
          })
          /*return new Promise((resolve, reject) => {
            debug("body: not yet implemented!");
            var e = new Error("body: not yet implemented!");
            reject(e);
          });*/
          break;
        case 'formData':
          //TODO: error handling
          return convertToType(undefined, elem)
          .then((output) => {
            return ({name: name, value: output});
          })
          /*return new Promise((resolve, reject) => {
            debug("formData: not yet implemented!");
            var e = new Error("body: not yet implemented!");
            reject(e);
          });*/
          break;
        default:
          //TODO: error handling
          return convertToType(undefined, elem)
          .then((output) => {
            return ({name: name, value: output});
          })
          /*return new Promise((resolve, reject) => {
            debug("Unsupported 'in' value: "+loc);
            var e = new Error("Unsupport 'in' value: "+loc);
            reject(e);
          });*/
      }
    }))
    .then(output => {
      debug("parseParameters, initial output: ", output);
      var result = {};
      output.forEach(elem => {
        result[elem.name] = elem.value; 
      });
      debug("parseParameters, after processing: ", result);
      resolve(result);
    }, error => {
      debug("parseParameters error: ", error);
      reject(error);
    });
  });
}

function makePathRegex(basePath, apiPath, grouping) {
  var path = apiPath;
  debug('makePathRegex path before: ', path);
  var braceBegin = -1;
  var braceEnd = -1;
  var i = 1;
  do {
    braceBegin = path.indexOf('{');
    if (braceBegin >= 0) {
      braceEnd = path.indexOf('}') + 1;
      var variablePath = path.substring(braceBegin, braceEnd);
      var variablePath_only = path.substring(braceBegin+1, braceEnd-1);
      path = path.replace(variablePath, '(.*)');
      grouping[variablePath_only] = i;
      i++;
    }
  } while (braceBegin >= 0);
  path = '^' + basePath + path + '$';
  debug('makePathRegex path after: ', path);
  return path;
}

/**
 * @brief In API developmenet UI, we have the following types
 *        -integer (OK)
 *        -long
 *        -float
 *        -double
 *        -string (OK)
 *        -bye
 *        -binary
 *        -boolean (OK)
 *        -date
 *        -dateTime
 *        -password
 *        -array
 *        -object
 *
 * TODO: How to handle if any conversion failed?
 *       return undefined/null?
 **/
function convertToType (orig, elem) {
  return new Promise((resolve, reject) => {
    if (orig === undefined)
      resolve(undefined);

    var type = elem.type;
    switch(type) {
      case 'string':
        resolve(orig.toString());
        break;
      case 'number':
        resolve(Number(orig));
        break;
      case 'integer':
        resolve(parseInt(orig));
        break;
      case 'boolean':
        var lowercase = orig.toLowerCase();
        var ret;
        if (typeof(orig) === 'boolean')
          ret = orig;
        else if (lowercase === 'false')
          ret = false;
        else if (lowercase === 'true')
          ret = true;
        else
          ret = undefined;
        resolve(ret);
        break;
      case 'array':
        // If type is array, items is required.
        // type: array
        // items:
        //   type: integer
        //   format: int64
        // collectionFormat: csv
        switch(elem.collectionFormat) {
          case 'csv':
          default: /*default is csv*/
          {
            var itemtype = elem.items.type;
            var itemformat = elem.items.format;
            csvParser(orig, function(error, output) {
              if (error) {
                resolve(undefined);
              } else {
                // convert all array element again!
                Promise.all(output[0].map( subelem => {
                  elem.type = itemtype; //overwrite
                  elem.format = itemformat; // overwrite
                  return convertToType(subelem, elem)
                  .then( (output) => {
                    return output;
                  })
                }))
                .then( (output) => {
                  resolve(output);
                });
              }
            });
          }
        }
        break;
      case 'file':
        //TODO: error handling
        resolve(undefined);
        /*console.error("Unsupported type value: "+type);
        var e = new Error("Unsupported type value: "+type);
        reject(e);*/
        break;
      default:
        //TODO: error handling
        resolve(undefined);
        /*console.error("Unsupported type value: "+type);
        var e = new Error("Unsupported type value: "+type);
        reject(e);*/
    }
  });
}

/**
 * Copy every API properties to the root of the context.
 * The reason is to make the following two syntaxes work.
 *
 * x-ibm-configuration:
 *   properties:
 *     loopback-url:
 *       value: http://localhost:3000
 *   assembly:
 *     execute:
 *       - invoke:
 *           target-url: '$(loopback-url)/$(request.path)'                       // no api.properties prefix
 *           target-url: '$(api.properties.loopback-url)/$(request.path)'       // w/ api.properties prefix
 * - target-url: $(loop
 */
function copyAPIProperties(ctx) {
  var apiProperties = ctx.get('api.properties');
  if (!apiProperties) {
    return;
  }

  Object.getOwnPropertyNames(apiProperties).forEach(function(name) {
    if (ctx.get(name)) {
      // skip properties that duplicate with top-level context properties
      debug('Skip setting ' + name + ' properties to context');
    } else {
      debug('Duplicate api.properties.%s=%s to %s', name, apiProperties[name], name);
      ctx.set(name, apiProperties[name]);
    }
  });
}
