/**
 * Populates APIm context variables in the Request category, including
 *  - request.verb
 *  - request.uri
 *  - request.path
 *  - request.headers.{name}: all header variable names will be in lower case
 *    (e.g. request.headers.authorization
 *  - request.content-type: normalized, may not be the same as request.
 *    headers.content-type
 *  - request.date
 *  - request.authorization
 */
'use strict';

//
// third-party module dependencies
//
var debug = require('debug')('strong-gateway:context:request-var');
var typeis = require('type-is');

/**
 *  Returns a function that can populate the variables in the
 *  Request category.
 *
 *  @param {Object} options
 *     - contentTypeMaps: {Array}, each item in the array is an {Object} w/
 *          key {String}: mapped target content type
 *          value {Array}: array of types to be normalized/mapped
 */
module.exports = function populateRequestVariables(options) {
  debug('configuration', options);

  options = options || {};

  var contentTypeMaps = options.contentTypeMaps || [
    { 'application/json': [ '*/json', '+json', '*/javascript' ] },
    { 'application/xml': [ '*/xml', '+xml'] }
  ];
  debug('content type mapping: ', contentTypeMaps);

  /**
   * Populates APIm context variables in the Request category
   *
   * @param {Context} ctx the APIm context object
   * @param {Request} req the express request object
   *
   */
  return function(ctx, req) {
    // The HTTP verb of this request.
    ctx.set('request.verb', req.method, true);

    // The full HTTP request URI from the application.
    ctx.set('request.uri', req.originalUrl, true);

    // The path section of the request.uri that starts with the API basePath.
    // Define getter function to implement this variable, because api.basepath
    // may not be configured yet.
    ctx.define('request.path', function() {
      return getPath(req.originalUrl, ctx.get('api.basepath'));
    }, false);
      

    ctx.set('request.headers', req.headers, true);

    if (req.get('content-type')) {
      ctx.set('request.content-type',
        normalizeContentType(req.get('content-type')), true);
    }

    ctx.set('request.date', new Date(), true);

    //TODO what if the req header doesn't contain 'authorization'?
    ctx.set('request.authorization', req.get('authorization'), true);

  };

  /**
   * Return the normalized content-type value using the
   * mapping defined in contentTypeMaps object.
   * If no matched mapping found, the original content-type
   * value is returned;
   *
   * @param {String} type the content-type value to be normalized
   */
  function normalizeContentType(type) {
    var result = type;
    contentTypeMaps.some(function(map) {
      for (var normalizedType in map) {
        if (typeis.is(type, map[normalizedType])) {
          result = normalizedType;
          return true;
        }
      }
    });
    return result;
  }

  /**
   * Return the path section of the request uri that starts with
   * the API basePath (i.e. api.root).
   *
   * @param {String} originalUrl the request uri
   * @param {basepath} the API basePath
   */
  function getPath(originalUrl, basepath) {
    basepath = basepath || '';

    var indexStart = 0, indexEnd = originalUrl.length;

    if (basepath.length > 0) {
      debug('basepath is "' + basepath + '"');

      if (originalUrl.indexOf(basepath) >= 0) {
        indexStart = basepath.length;
      } else {
        debug('url "' + originalUrl + '" does not start with basepath');
      }
    }

    var queryParamIndex = originalUrl.indexOf('?');
    if (queryParamIndex > 0) {
      debug('trim query parameters after ' + queryParamIndex + 'th char');
      indexEnd = queryParamIndex;
    }

    return originalUrl.substring(indexStart, indexEnd);
  }
};


