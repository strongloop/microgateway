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
 *  - request.body
 *  - request.parameters
 */
'use strict';

//
// third-party module dependencies
//
var _ = require('lodash');
var authHeader = require('auth-header');
var debug = require('debug')('micro-gateway:context:request-var');
var typeis = require('type-is');
var urlParse = require('url').parse;
var assert = require('assert');

//create body parsers for different content-type payload
var bodyParser = {
  json:
    require('body-parser').json( { strict: false, type: checkType }),

  text:
    require('body-parser').text( { type: checkType }),

  urlencoded:
    require('body-parser').urlencoded({ extended: true, type: checkType }),

  raw:
    require('body-parser').raw( { type: checkType})
};

/**
 * This function is used by the body-parser to check if it should
 * parse the req payload.  We'll always parse.
 */
function checkType(req) {
  return true;
}

/**
 *  Returns a function that can populate the variables in the
 *  Request category.
 *
 *  @param {Object} options
 *     - contentTypeMaps: {Array}, each item in the array is an {Object} w/
 *          key {String}: mapped target content type
 *          value {Array}: array of types to be normalized/mapped
 *     - bodyParser: {Array}, each item in the array is an {Object} w/
 *          key {String}: parser name, 'json' | 'text' | 'urlencoded' | 'raw'
 *          value {Array}: array of matched mime types
 *     - bodyFilter: {Array}, each item in the array is an {Object} w/
 *          key {String}: HTTP method name in capital
 *          value {Array}: filter action, 'reject' | 'ignore'
 */
module.exports = function populateRequestVariables(options) {
  debug('configuration', options);

  options = options || {};

  var contentTypeMaps = options.contentTypeMaps || [
    { 'application/json': [ '*/json', '+json', '*/javascript' ] },
    { 'application/xml': [ '*/xml', '+xml'] }
  ];
  debug('content type mapping: ', contentTypeMaps);

  var bodyParserOption = options.bodyParser || [
    { json: [ '*/json', '+json' ] },         // JSON content-type using json parser
    { text: [ 'text/*', '*/xml', '+xml'] },  // text content-type using text parser
    { urlencoded: [ '*/x-www-form-urlencoded'] },
    { raw: [ '*/*' ] } // any other data type, using raw parser
  ];
  debug('bodyParser option: ', bodyParserOption);

  const filterReject = 'reject';
  const filterIgnore = 'ignore';
  var bodyFilterOption = options.bodyFilter || {
    DELETE: filterReject,
    GET: filterReject,
    HEAD: filterReject,
    OPTIONS: filterIgnore
  };
  debug('bodyFilter option: ', bodyFilterOption);

  /**
   * Populates APIm context variables in the Request category
   *
   * @param {Context} ctx the APIm context object
   * @param {Request} req the express request object
   *
   */
  return function(ctx, req, callback) {
    debug('populate-request-variables');

    ctx.set('request.clientip', req.ip || req.connection.remoteAddress);
    ctx.set('request.start', new Date());

    // The HTTP verb of this request.
    ctx.set('request.verb', req.method, true);

    // The full HTTP request URI from the application.
    ctx.set('request.uri', req.originalUrl, true);


    var url = urlParse(req.originalUrl, true);

    // Define getter function to implement this variable, because api.basepath
    // may not be configured yet.
    ctx.define('request.path', function() {
      return getPath(url.pathname, ctx);
    }, false);


    ctx.set('request.headers', req.headers, true);

    if (req.get('content-type')) {
      ctx.set('request.content-type',
        normalizeContentType(req.get('content-type')), true);
    }

    ctx.set('request.date', new Date(), true);

    ctx.set('request.authorization',
      parseAuthorizationHeader(req.get('authorization')), true);

    ctx.set('request.parameters', url.query);

    // TODO use body-parser for now, in the future, lazy reading?
    if (req.body) {
      debug('set existing req.body to request.body');
      setRequestBody();
    } else {
      /*
       * TODO - We should probably defer the request.body variables population
       *        till swagger metadata is annotated.
       *        With that, we know the content-type and we know what data type
       *        to be put into request.body.
       *        We probably should also make request.body as a getter to
       *        do lazy read
       */
      // TODO - if there is no body, no need to parse
      var contentType = ctx.get('request.content-type');
      debug('request.content-type is "' + contentType +
        '", parse payload as request.body');
      var parserName;
      bodyParserOption.some(function(map) {
        for (var parseMethod in map) {
          if (typeis.is(contentType, map[parseMethod])) {
            parserName = parseMethod;
            return true;
          }
        }
      });

      if (!parserName) {
        parserName = 'raw';
      }

      if (typeis.hasBody(req)) {
        switch (bodyFilterOption[req.method]) {
          case filterReject:
            setRequestBody({
              name: "PopulateContextError",
              message: 'Invalid ' + req.method + ' request with payload'
            });
            return;
          case filterIgnore:
            debug('Ignore payload from ' + req.method + ' request');
            break;
          default:
            debug('use ' + parserName + 'Parser to parse payload');
            bodyParser[parserName](req, {}, setRequestBody);
            return;
        }
      }

      debug('request does not have payload');
      switch (parserName) {
        case 'json':
          setRequestBody({
            name: 'PopulateContextError',
            message: 'Unable to parse empty payload as JSON'
          });
          break;
        case 'text':
          req.body = '';
          setRequestBody();
          break;
        case 'urlencoded':
          req.body = {};
          setRequestBody();
          break;
        case 'raw':
          req.body = new Buffer(0);
          setRequestBody();
          break;
      }
    }

    /**
     * Sets req.body to request.body.
     *
     * @param error if any error during payload parsing
     */
    function setRequestBody(error) {
      // if there is a content-type header, we make request.body as read-only
      // otherwise, make it writable.. so later on it can be reparsed
      var makeReadOnly = !_.isEmpty(ctx.get('request.content-type'));
      if (error) {
        debug('parse payload error ', error);
        ctx.set('request.body', undefined, makeReadOnly);
      } else {
        ctx.set('request.body', req.body, makeReadOnly);
      }
      process.nextTick(callback, error);
    }
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
   * the API basePath.
   * APIm URL syntax:
   *  <protocol>://<hostname>[:<port>]/<provider organization>[/<catalog>][/<basepath>]/<path>[?<clientid query param>=<client identifier>[&<client secret query param>=<client secret>]]
   *
   * This function returns the [/<basepath>][/path] part
   *
   * @param pathname {String} originalUrl the request uri
   * @param context {Context} the context object
   */
  function getPath(pathname, context) {
    // basepath could be:
    //  - undefined
    //  - '' (empty string)
    //  - string starts with or w/o '/'
    //  - string ends with or w/o '/'

    // TODO: need to change this to use the same regular expression that
    //       $(request.parameters) and preflow URL matching uses, so we
    //       make sure all these path handling is consistent
    return pathname;
  }

  /**
   * Return the parsed authorization object.
   *
   * @param {auth} the authorization header value
   */
  function parseAuthorizationHeader(auth) {
    if (auth) {
      var result = authHeader.parse(auth).values;
      debug('authorization header: ', result);
      return result.length === 1 ? result[0] : undefined;
    } else {
      return undefined;
    }
  }

};


