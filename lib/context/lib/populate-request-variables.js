// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

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
var apicConfig = require('apiconnect-config');
var authHeader = require('auth-header');
var bodyParser = require('body-parser');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:context:populate-request-variables' });
var project = require('apiconnect-project');
var typeis = require('type-is');
var urlParse = require('url').parse;


/**
 *  Returns a function that can populate the variables in the
 *  Request category.
 *
 *  @param {Object} options
 *     - contentTypeMaps: {Array}, each item in the array is an {Object} w/
 *          key {String}: mapped target content type
 *          value {Array}: array of types to be normalized/mapped
 *     - bodyFilter: {Array}, each item in the array is an {Object} w/
 *          key {String}: HTTP method name in capital
 *          value {Array}: filter action, 'reject' | 'ignore'
 */
module.exports = function populateRequestVariables(options) {
  logger.debug('configuration', options);

  options = options || {};

  var contentTypeMaps = options.contentTypeMaps || [
    { 'application/json': [ '*/json', '+json', '*/javascript' ] },
    { 'application/xml': [ '*/xml', '+xml' ] } ];
  logger.debug('content type mapping: ', contentTypeMaps);

  var filterReject = 'reject';
  var filterIgnore = 'ignore';
  var bodyFilterOption = options.bodyFilter || {
    DELETE: filterIgnore,
    GET: filterIgnore,
    HEAD: filterIgnore,
    OPTIONS: filterIgnore };
  logger.debug('bodyFilter option: ', bodyFilterOption);

  var rawBodyParser = bodyParser.raw({
    type: function(req) { return true; },
    limit: getParserSizeLimit() });

  /**
   * Populates APIm context variables in the Request category
   *
   * @param {Context} ctx the APIm context object
   * @param {Request} req the express request object
   *
   */
  return function(ctx, req, callback) {
    logger.debug('populate-request-variables');

    // The HTTP verb of this request.
    ctx.set('request.verb', req.method, true);

    // The full HTTP request URI from the application.
    ctx.set('request.uri', req.protocol + '://' +
                           req.get('host') +
                           req.originalUrl, true);


    var url = urlParse(req.url, false);

    // Define getter function to implement this variable, because api.basepath
    // may not be configured yet.
    ctx.define('request.path', function() {
      return getPath(url.pathname, ctx);
    }, false);

    // Add the query string
    ctx.set('request.search', url.search || '', true);
    ctx.set('request.querystring', url.query || '', true);

    ctx.set('request.headers', req.headers, true);

    if (req.get('content-type')) {
      ctx.set('request.content-type',
        normalizeContentType(req.get('content-type')), true);
    }

    ctx.set('request.date', new Date(), true);

    ctx.set('request.authorization',
      parseAuthorizationHeader(req.get('authorization')), true);

    // TODO use body-parser for now, in the future, lazy reading?
    if (req.body) {
      logger.debug('set existing req.body to request.body');
      setRequestBody();
    } else if (!typeis.hasBody(req)) {
      logger.debug('request does not have payload, set request.body as empty Buffer');
      req.body = new Buffer(0);
      setRequestBody();
    } else {
      // TODO - use lazy read or streaming to improve performance
      // there is a request payload, check if we should read it
      switch (bodyFilterOption[req.method]) {
        case filterReject:
          logger.info('Reject %s request with payload', req.method);
          setRequestBody({ message: 'Invalid ' + req.method + ' request with payload' });
          return;
        case filterIgnore:
          logger.info('Ignore payload from ' + req.method + ' request');
          req.body = new Buffer(0);
          setRequestBody();
          break;
        default:
          logger.debug('use raw parser to parse payload as Buffer');
          rawBodyParser(req, {}, setRequestBody);
          return;
      }

    }

    /**
     * Sets req.body to request.body.
     *
     * @param error if any error during payload parsing
     */
    function setRequestBody(error) {
      if (error) {
        // rewrite the error, so we don't expose too much info
        logger.error('parse payload error ', error);
        ctx.set('error.status.code', error.statusCode || 400);
        var rewrittenError = {
          name: 'PreFlowError',
          message: error.message || 'Invalid request payload' };
        error = rewrittenError;
      } else {
        ctx.set('request.body', req.body);
      }
      // Node 0.12 doesn't support the extra args after the callback function
      process.nextTick(function() {
        callback(error);
      });
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
   *  <protocol>://<hostname>[:<port>]/<provider organization>[/<catalog>][/<basepath>]/<path>
   *  [?<clientid query param>=<client identifier>[&<client secret query param>=<client secret>]]
   *
   * This function returns the [/<basepath>][/path] part
   *
   * @param pathname {String} url the request uri
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
//      sensitive headers
//      logger.debug('authorization header: ', result);
      return result.length === 1 ? result[0] : undefined;
    } else {
      return undefined;
    }
  }

};

var defaultParserSizeLimit = 4096000; // 4MB (same as DataPower's default)
/**
 * Return the payload parser size limit in bytes.
 * If user doesn't configure the size, default value, 4MB, will be returned.
 *
 */
function getParserSizeLimit() {
  var projectInfo = project.inspectPath(process.env.CONFIG_DIR || process.cwd());

  var config = apicConfig.loadConfig({
    projectDir: projectInfo.basePath,
    shouldParseUris: false });

  var sizeLimit;

  [ apicConfig.PROJECT_STORE, apicConfig.USER_STORE ].some(function(location) {
    var obj = config.get('parserSizeLimit', location);
    if (obj.parserSizeLimit && _.isInteger(parseInt(obj.parserSizeLimit, 10))) {
      sizeLimit = obj.parserSizeLimit;
      logger.debug('set parserSizeLimit to %d bytes', sizeLimit);
      return true;
    }
  });

  if (!_.isInteger(sizeLimit)) {
    sizeLimit = defaultParserSizeLimit;
    logger.debug('set parserSizeLimit to default %d bytes', sizeLimit);
  }

  return sizeLimit;
}
