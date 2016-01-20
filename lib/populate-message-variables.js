/**
 * Populates APIm context variables in the Message category, including
 *  - message.headers.{headername}
 *  - message.body
 */
'use strict';

//
// third-party module dependencies
//
var _ = require('lodash');
var debug = require('debug')('strong-gateway:context:message-var');
var typeis = require('type-is');

//create body parsers for different content-type payload
var bodyParser = {
  json:
    require('body-parser').json( { strict: false, type: '*/*' }),

  text:
    require('body-parser').text( { type: '*/*' }),

  urlencoded:
    require('body-parser').urlencoded({ extended: true, type: '*/*' }),

  raw:
    require('body-parser').raw( { type: '*/*'})
};


/**
 *  Returns a function that can populate the variables in the
 *  Message category.
 *
 *  @param {Object} options
 *     - contentTypeMaps: {Array}, each item in the array is an {Object} w/
 *          key {String}: the method to parse the payload, key is one of
 *                        'json', 'text', 'urlencoded', 'raw'.
 *          value {Array}: array of content types
 */
module.exports = function populateMessageVariables(options) {
  debug('configuration', options);

  options = options || {};

  var bodyParserOption = options.bodyParser || [
    { json: [ '*/json', '+json' ] },  // JSON content-type using json parser
    { text: [ 'text/*'] },          // text content-type using text parser
    { urlencoded: [ '*/x-www-form-urlencoded'] },
    { raw: [ '*/*' ] } // any other data type, using raw parser
  ];

  /**
   * Populates APIm context variables in the Message category
   *
   * @param {Context} ctx the APIm context object
   * @param {Request} req the express request object
   *
   */
  return function(ctx, req, callback) {
    debug('populate-message-variables');

    // make a copy of the req.header, as changing message.headers
    // should not change req.headers
    ctx.set('message.headers', _.cloneDeep(req.headers));

    // TODO use body-parser for now, in the future, lazy reading?
    if (req.body) {
      debug('set existing req.body to message.body');
      setMessageBody();
    } else {
      /*
       * TODO - we should probably defer the message variables population till,
       *        swagger metadata is annotated.
       *        with that, we know the content-type and we know what data type
       *        to be put into message.body.
       *        we probably should also make message.body as a getter to
       *        do lazy read
       */
      // TODO - if there is no body, no need to parse
      var contentType = ctx.get('request.content-type');
      debug('request.content-type is "' + contentType +
        '", parse payload as message.body');
      var matchFound = bodyParserOption.some(function(map) {
        for (var parseMethod in map) {
          if (typeis.is(contentType, map[parseMethod])) {
            debug('use ' + parseMethod + 'Parser to parse payload');
            bodyParser[parseMethod](req, {}, setMessageBody);
            return true;
          }
        }
      });

      // when no content-type matches (ex: no content-type header)
      // use raw bodyparser
      if (!matchFound) {
        debug('no content type match, use rawBodyPaser to parse payload');
        bodyParser.raw(req, {}, function(err) {
          setMessageBody(err, req.body);
        });
      }
    }

    /**
     * Sets req.body to message.body.
     *
     * @param error if any error during payload parsing
     */
    function setMessageBody(error) {
      if (error) {
        debug('parse payload error ', error);
        ctx.set('message.body', undefined);
      } else {
        var body = req.body;
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
      process.nextTick(callback, error);
    }
  };
};
