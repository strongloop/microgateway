// populate the APIm context variables

'use strict';

//
// third-party module dependencies
//
var _        = require('lodash');
var csvParser= require('csv-parse');
var moment   = require('moment');
var debug    = require('debug')('micro-gateway:preflow:context-populate');
var url      = require('url');
var typeis = require('type-is');


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

    // Check if message.body and request.body contains the right data type
    if ( _.isEmpty(ctx.get('request.content-type')) &&
         typeis.hasBody(req) &&
         !_.isEmpty(ctx.get('_.api.consumes')) ) {
      reparseRequestBody(ctx, ctx.get('_.api.consumes'));
    }

    // Fill in ctx.request.parameters here
    parseParameters(ctx, req)
    .then(output => {
      debug('Set request.parametrs: ', output);
      ctx.set('request.parameters', output);

      resolve(ctx);
    }, error => {
      debug('parseParameters error: ', error);
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
 *          param1: 'value1',
 *          param2: 9999
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
  var body       = ctx.get('request.body');

  debug('paramArray: ', paramArray);
  debug('basePath: ', basePath);
  debug('request path: ', reqPath);
  debug('request originalUrl: ', req.originalUrl);
  debug('request headers: ', headers);
  debug('query string: ', urlParsedResult.query);

  // If path is /context/request/parameters/{param4}/{param3}.
  // Process Path Template first. Create pathTemplate object with name and order:
  // {
  //      'param4': 1
  //      'param3': 2
  // }
  // Execute regexp.exec() to get grouping result array:
  // pathTemplateRseult is array:
  // ['/context/request/parameters/{param4}/{param3}', 'abc', 9999]
  var pathTemplate = {};
  var pattern = makePathRegex(basePath, reqPath, pathTemplate);
  var pathTemplateResult = (new RegExp(pattern, 'i')).exec(urlParsedResult.pathname);
  debug('pathTemplate: ', pathTemplate);
  debug('pathTemplateResult: ', pathTemplateResult);

  return new Promise((resolve, reject) => {
    Promise.all(paramArray.map( elem => {
      var loc  = elem['in'];
      var name = elem.name;
      debug('parameter: ', elem);
      switch (loc) {
        case 'query':
          // urlParsedResult is the same as req.query
          // return undefined if query doens't exist.
          // if param1=value1&param1=value2, url.parse will return
          // an array param1 = [value1, value2]
          return convertToType(urlParsedResult.query[name], elem)
          .then((output) => {
            return ({name: name, value: output});
          });
          break;
        case 'path':
          // return undefined if path doesn't exist.
          return convertToType(pathTemplateResult[pathTemplate[name]], elem)
          .then((output) => {
            return ({name: name, value: output});
          });
          break;
        case 'header':
          // header is lower case.
          var lowercase = name.toLowerCase();
          // return undefined if header doesn't exist.
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
          return convertToType(body[name], elem)
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
          // If 'in' value is not undefined, return
          // undefined. schema validation should be done in
          // schema validation policy.
          return convertToType(undefined, elem)
          .then((output) => {
            return ({name: name, value: output});
          })
      }
    }))
    .then(output => {
      debug('parseParameters, initial output: ', output);
      var result = {};
      output.forEach(elem => {
        result[elem.name] = elem.value; 
      });
      debug('parseParameters, after processing: ', result);
      resolve(result);
    }, error => {
      debug('parseParameters error: ', error);
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
    APIm     | Swagger  | JavaScript     | Remark
    ---------|----------|----------------|------------------
    array    | array    | [] (array)     | done
    binary   | n/a      | Buffer object  | done
    boolean  | boolean  | boolean        | done
    byte     | n/a      | Buffer object  | done
    date     | n/a      | Date object    | done
    dateTime | n/a      | Date object    | done
    double   | number   | number value   | done
    float    | number   | number value   | done
    integer  | integer  | number value   | done
    long     | integer  | number value   | done
    object   | n/a      | JSON object    | done
    password | n/a      | string value   | done
    string   | string   | string value   | done

    If type is not provided, return original value.
    If number parse error, return NaN.
    If other parse error, return undefined.
 **/
function convertToType (orig, elem) {
  return new Promise((resolve, reject) => {
    if (orig === undefined || orig === null)
      resolve(undefined);

    var type = elem.type;
    switch(type) {
      case 'array':
        // If type is array, items is required.
        // type: array
        // items:
        //   type: integer
        //   format: int64
        // collectionFormat: csv
        var collectionFormat = elem.collectionFormat;
        if (collectionFormat === 'multi') {
          //foo=bar&foo=baz. This is valid only for parameters in 'query' or 'formData'
          resolve(orig);
        } else {
          var options = {delimiter: ','};
          switch(collectionFormat) {
            case 'ssv':
              options.delimiter = ' ';
              break;
            case 'tsv':
              options.delimiter = '\t';
              break;
            case 'pipes':
              options.delimiter = '|';
              break;
            case 'csv':
            default:
              options.delimiter = ',';
          }
          var itemtype = elem.items.type;
          var itemformat = elem.items.format;
          csvParser(orig, options, function(error, output) {
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
        break;
      case 'binary':
        // orig is string and assume default encoding is utf8
        resolve(new Buffer(orig));
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
      case 'byte':
        // orig is string and assume default encoding is utf8
        resolve(new Buffer(orig));
      case 'date':
      case 'dateTime':
        var m = moment(orig);
        resolve(new Date(m._d));
        break;
      case 'double':
      case 'float':
      case 'integer':
      case 'long':
        resolve(new Number(orig));
        break;
      case 'object':
        try {
          var o = JSON.parse(orig);
          resolve(o);
        } catch(e) {
          resolve(undefined);
        }
        break;
      case 'password':
        resolve(orig.toString());
        break;
      case 'string':
        resolve(orig.toString());
        break;
      /* The following type is defined in swagger but not exist in APIm */
      case 'number':
        resolve(new Number(orig));
        break;
      case 'file':
        //TODO: error handling
        resolve(undefined);
        break;
      default:
        // If type is not provided, return orig string
        resolve(orig);
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

/**
 * When incoming request does not have a content-type header,
 * the payload should be parsed according to the API's consumes
 * definition.
 *
 * @param {Context} ctx the context object
 * @param {Array} consumes is an array of mime types the API can consume
 */
function reparseRequestBody(ctx, consumes) {
  debug('reparseRequestBody start.');
  var bodyReparsed = false;
  var body = ctx.get('request.body')
  for (var i=0; i<consumes.length; i++) {
    if (typeis.is(consumes[i], ['*/json', '*/javascript'])) {
      try {
        body = JSON.parse(body.toString());
        bodyReparsed = true;
        debug('reparse the payload as JSON');
      } catch (error) {
        debug('payload is not a valid JSON');
      }
    } else if (typeis.is(consumes[i], ['text/*', '*/xml', '+xml'])) {
      body = body.toString();
      bodyReparsed = true;
      debug('reparse the payload as string');
    }
    if (bodyReparsed) {
      break; // break the loop
    }
  }

  if (bodyReparsed) {
    ctx.set('request.body', body, true);

    // TODO: this duplicate with the logic in populate-message-variables.js
    // make a copy of the req.body, as changing message.body
    // should not change req.body
    var cloneBody;
    if (Buffer.isBuffer(body)) {
      cloneBody = new Buffer(body);
    } else if (_.isString(body)) {
      cloneBody = body;
    } else {
      cloneBody = _.cloneDeep(body);
    }
    ctx.set('message.body', cloneBody);
  }
}