// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

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
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:context:populate-message-variables' });

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

    // make a copy of the req.header
    setMessageHeaders(ctx, req);

  };

  /**
   * Set message.headers with a copy of the original request headers.
   * The headername's upper/lower case is preserved.
   * As message.headers is a copy, changing it doesn't affect the original
   * request.headers content.
   *
   * @param {Context} ctx the APIm context object
   * @param {Request} req the express request object
   */
  function setMessageHeaders(ctx, req) {
    // Note: there is no response.rawHeaders for node v0.10.43
    var rawHeaders = req.rawHeaders;

    if (_.isEmpty(rawHeaders)) {
      ctx.set('message.headers', {});
      return;
    }

    // store the headers with recovered headername' case
    var headers = {};

    // the even-numbered offsets are header names
    for (var i = 0; i < rawHeaders.length; i += 2) {
      var name = rawHeaders[i];

      // skip duplicate headers, which should has been normalized by express
      if (!headers[name]) {
        headers[name] = req.get(name);
      }
    }

    ctx.set('message.headers', _.cloneDeep(headers));

  }

};
