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
var logger = require('../../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:context:populate-message-variables'});

/**
 *  Returns a function that can populate the variables in the
 *  Message category.
 *
 */
module.exports = function populateMessageVariables(options) {
  logger.debug('configuration', options);

  options = options || {};

  /**
   * Populates APIm context variables in the Message category
   *
   * @param {Context} ctx the APIm context object
   * @param {Request} req the express request object
   *
   */
  return function(ctx, req) {
    logger.debug('populate-message-variables');

    // make a copy of the req.header, as changing message.headers
    // should not change req.headers
    ctx.set('message.headers', _.cloneDeep(req.headers));
    ctx.set('message.rawHeaders', _.cloneDeep(req.rawHeaders));

    setMessageBody(ctx, req.body);
  };

  function setMessageBody(ctx, body) {
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
};
