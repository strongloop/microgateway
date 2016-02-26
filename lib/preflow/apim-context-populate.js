// populate the APIm context variables

'use strict';

//
// third-party module dependencies
//
var url      = require('url');
var debug    = require('debug')('micro-gateway:preflow:context-populate');


/**
 * @param {Object} api the API object of this request
 * @param {Object} ctx the context object
 * @param {Object} req the express request object
 *
 * @returns the updated context object
 */
module.exports = function populateAPImCtx(api, ctx, req) {
  // _ denotes internal variables
  ctx.set('_.assembly', api.flow);
  ctx.set('_.api', api._);

  ctx.set('config-snapshot-id', api.snapshot);
  ctx.set('api', api.api);
  ctx.set('plan', api.plan);
  ctx.set('client', api.client);

  setEndPoint(ctx, req);

  // Fill in ctx.request.parameters here
  parseParameters(ctx, req);

  return ctx;
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

  var output = {};
  paramArray.forEach( elem => {
    var loc  = elem["in"];
    var name = elem.name;
    var type = elem.type;
    debug("parameter: ", elem);
    switch (loc) {
      case 'query':
        // urlParsedResult is the same as req.query
        output[name] = convertToType(urlParsedResult.query[name], type);
        break;
      case 'path':
        if (pathTemplate[name]) {
          output[name] = convertToType(pathTemplateResult[pathTemplate[name]], type);
        } else {
          console.error("If the parameter is in 'path', it MUST exist in Path Template.");
          throw Error("If the parameter is in 'path', it MUST exist in Path Template.")
        }
        break;
      case 'header':
        // header is lower case.
        var lowercase = name.toLowerCase();
        if (headers[lowercase]) {
          output[name] = convertToType(headers[lowercase], type);
        }
        break;
      case 'body':
        debug("body: not yet implemented!");
        break;
      case 'formData':
        debug("formData: not yet implemented!");
        break;
      default:
        console.error("Unsupported in value: "+loc);
        throw Error("Unsupported in value: "+loc);
    }
  });

  ctx.set('request.parameters', output);
  debug("request.parameters: ", output);
  debug("parseParameters end.")
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

function convertToType (orig, type) {
  if (orig === undefined)
    return undefined;

  var ret = undefined;
  switch(type) {
    case 'string':
      ret = orig.toString();
      break;
    case 'number':
      ret = Number(orig);
      break;
    case 'integer':
      ret = parseInt(orig);
      break;
    case 'boolean':
      var lowercase = orig.toLowerCase();
      if (typeof(orig) === 'boolean')
        ret = orig;
      else if (lowercase === 'false')
        ret = false;
      else if (lowercase === 'true')
        ret = true;
      else
        ret = undefined;
      break;
    case 'array':
      break;
    case 'file':
      break;
    default:
      console.error("Unsupported type value: "+type);
      throw Error("Unsupported type value: "+type);
  }
  return ret;
}
