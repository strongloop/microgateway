// populate the APIm context variables

'use strict';

//
// third-party module dependencies
//
var _        = require('lodash');
var contentType = require('content-type');
var csvParser= require('csv-parse');
var moment   = require('moment');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:preflow:apim-context-populate'});
var Promise = require('bluebird');
var qs = require('qs');
var url      = require('url');
var typeis = require('type-is');
var stream = require('stream');


/**
 * @param {Object} api the API object of this request
 * @param {Object} ctx the context object
 * @param {Object} req the express request object
 *
 * @returns the updated context object
 */
module.exports = function populateAPImCtx(api, ctx, req) {
  return new Promise(function(resolve, reject) {
    // _ denotes internal variables
    ctx.set('_.assembly', api.flow);
    ctx.set('_.api', api._);

    ctx.set('config-snapshot-id', api.snapshot);
    ctx.set('api', api.api);
    ctx.set('client', api.client);
    ctx.set('client.app.secret', 
      ctx.get('hdr-client-secret') || ctx.get('qry-client-secret'));
    ctx.set('env', api.env);
    ctx.set('plan', api.plan);

    setEndPoint(ctx, req);

    // Duplicate api.properties.* to context
    copyAPIProperties(ctx);

    // parse payload and store into $(request.body)
    try {
      parseRequestBody(ctx, req);
    } catch (error) {
      reject(error);
    }

    // Make a copy of $(request.body) to $(message.body)
    cloneMessageBody(ctx);

    // Fill in ctx.request.parameters here
    parseParameters(ctx, req)
    .then(function(output) {
      logger.debug('Set request.parametrs: ', output);
      ctx.set('request.parameters', output);

      resolve(ctx);
    },
    function(error) {
      logger.debug('parseParameters error: ', error);
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
  logger.debug('parseParameters start.');

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
  var urlParsedResult = url.parse(req.url, true);
  var headers    = req.headers;
  var body       = ctx.get('request.body');

  logger.debug('paramArray: ', paramArray);
  logger.debug('basePath: ', basePath);
  logger.debug('request path: ', reqPath);
  logger.debug('request url: ', req.url);
  logger.debug('request headers: ', headers);
  logger.debug('query string: ', urlParsedResult.query);

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
  logger.debug('pathTemplate: ', pathTemplate);
  logger.debug('pathTemplateResult: ', pathTemplateResult);

  return new Promise(function(resolve, reject) {
    Promise.all(paramArray.map(function(elem) {
      var loc  = elem['in'];
      var name = elem.name;
      logger.debug('parameter: ', elem);
      switch (loc) {
        case 'query':
          // urlParsedResult is the same as req.query
          // return undefined if query doens't exist.
          // if param1=value1&param1=value2, url.parse will return
          // an array param1 = [value1, value2]
          return convertToType(urlParsedResult.query[name], elem)
          .then(function(output) {
            return ({name: name, value: output});
          });
          break;
        case 'path':
          // return undefined if path doesn't exist.
          return convertToType(pathTemplateResult[pathTemplate[name]], elem)
          .then(function(output) {
            return ({name: name, value: output});
          });
          break;
        case 'header':
          // header is lower case.
          var lowercase = name.toLowerCase();
          // return undefined if header doesn't exist.
          return convertToType(headers[lowercase], elem)
          .then(function(output) {
            return ({name: name, value: output});
          });
          break;
        case 'body':
          //TODO: error handling
          return ({name: name, value: body})
          /*return new Promise(function(resolve, reject) {
            logger.debug("body: not yet implemented!");
            var e = new Error("body: not yet implemented!");
            reject(e);
          });*/
          break;
        case 'formData':
          //TODO: error handling
          return convertToType(body[name], elem)
          .then(function(output) {
            return ({name: name, value: output});
          })
          /*return new Promise(function(resolve, reject) {
            logger.debug("formData: not yet implemented!");
            var e = new Error("body: not yet implemented!");
            reject(e);
          });*/
          break;
        default:
          // If 'in' value is not undefined, return
          // undefined. schema validation should be done in
          // schema validation policy.
          return convertToType(undefined, elem)
          .then(function(output) {
            return ({name: name, value: output});
          })
      }
    }))
    .then(function(output) {
      logger.debug('parseParameters, initial output: ', output);
      var result = {};
      output.forEach(function(elem) {
        result[elem.name] = elem.value;
      });
      logger.debug('parseParameters, after processing: ', result);
      resolve(result);
    },
    function(error) {
      logger.debug('parseParameters error: ', error);
      reject(error);
    });
  });
}

function makePathRegex(basePath, apiPath, grouping) {
  var path = apiPath;
  logger.debug('makePathRegex path before: ', path);
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
  logger.debug('makePathRegex path after: ', path);
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
  return new Promise(function(resolve, reject) {
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
              Promise.all(output[0].map(function(subelem) {
                elem.type = itemtype; //overwrite
                elem.format = itemformat; // overwrite
                return convertToType(subelem, elem)
                .then(function(output) {
                  return output;
                })
              }))
              .then(function(output) {
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
        resolve(new Number(orig).valueOf());
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
        resolve(new Number(orig).valueOf());
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
      logger.debug('Skip setting ' + name + ' properties to context');
    } else {
      logger.debug('Duplicate api.properties.%s=%s to %s', name, apiProperties[name], name);
      ctx.set(name, apiProperties[name]);
    }
  });
}

/**
 * This function performs the following works
 *  1. parse the Buffer-type payload in $(request.body) to the data type
 *     according to $(request.content-type) and $(_.api.consumes).
 *  2. store the parsed data type to $(request.body)
 *  3. mark $(request.body) read only
 *
 * @param {Context} ctx the context object
 * @param {Request} req the express request object
 */
function parseRequestBody(ctx, req) {
  if (!typeis.hasBody(req)) {
    return;
  };

  // determine what data types the payload should be parsed as
  var targetContentTypes;
  if (ctx.get('request.content-type')) {
    targetContentTypes = [ ctx.get('request.content-type') ];
  } else {
    targetContentTypes = ctx.get('_.api.consumes');
  }

  if (_.isEmpty(targetContentTypes)) {
    logger.warn('Unable to determine payload data type, store payload as Buffer');
  } else {
    logger.debug('parse payload as one of ', targetContentTypes);
    var body = ctx.get('request.body'); // body should be Buffer
    var successfullyParsed = targetContentTypes.some(function(type) {
      if (typeis.is(type, ['*/json'])) {
        try {
          body = JSON.parse(body.toString());
          logger.debug('%s payload has been parsed as JSON', type);
          return true;
        } catch (error) {
          logger.debug('parse payload as JSON failed: ', error);
        }
      } else if (typeis.is(type, ['text/*', '*/xml', '+xml'])) {
        var charSet = 'utf-8';
        try {
          charSet = contentType.parse(req).parameters.charset;
          charSet = charSet ? charSet.toLowerCase() : 'utf-8';
        } catch (error) {
          logger.debug('unable to determine payload charset: ', error);
        }

        try {
          body = body.toString(charSet); // check the encoding
          logger.debug('%s payload has been parsed as %s-encoded string', type, charSet);
          return true;
        } catch (error) {
          logger.debug('parse payload as %s-encoded string failed: %j', charSet, error);
        }
      } else if (typeis.is(type, [ '*/x-www-form-urlencoded'])) {
        try {
          body = qs.parse(body.toString());
          logger.debug('%s payload has been parsed as x-www-form-urlencoded data', type);
          return true;
        } catch (error) {
          logger.debug('parse payload as x-www-form-urlencoded data failed: ', error);
        }
      } else {
        logger.debug('%s payload remain as a Buffer object', type);
        return true;
      }
    });

    if (!successfullyParsed) {
      logger.error('unable to parse payload as one of ', targetContentTypes);
      throw 'unable to parse payload as one of ' + targetContentTypes;
    }
  }

  // make the $(request.body) read-only
  ctx.set('request.body', body, true);
}

/**
 * This function copies $(request.body) to $(message.body)
 *
 * @param {Context} ctx the context object
 */
function cloneMessageBody(ctx) {
  var body = ctx.get('request.body');
  var cloneBody;
  if (Buffer.isBuffer(body)) {
    cloneBody = new Buffer(body);
  } else if (_.isString(body)) {
    cloneBody = body;
  } else if (_.isPlainObject(body)) {
    cloneBody = _.cloneDeep(body);
  } else {
    // Other types such as stream
    cloneBody = body;
  }
  ctx.set('message.body', cloneBody);
}
