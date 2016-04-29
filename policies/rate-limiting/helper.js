// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
  .child({loc: 'apiconnect-microgateway:policies:rate-limiting:helper'});

exports.handleResponse =
  function(limit, remaining, reset, reject, context, flow) {
    if (remaining < 0 && reject) {
      var resMsg = setupHeaders();
      var err = new Error('Rate limit exceeded');
      err.status = { code: 429 };
      err.name = 'RateLimitExceeded';
      context.error = err;
      logger.debug('Rate limit exceeded: %j', err);
      return flow.fail(err);
    }

    if (remaining < 0 && !reject) {
      logger.warn('Rate limit (%d) exceeded but not rejected', limit);
    }

    context.subscribe('post-flow', function(event, done) {
      setupHeaders();
      done();
    });

    return flow.proceed();

    function setupHeaders() {
      var resMsg = context.get('message');
      if (!resMsg) {
        resMsg = {};
        context.set('message', resMsg);
      }
      var resMsgHeaders = resMsg && resMsg.headers;
      if (!resMsgHeaders) {
        resMsgHeaders = {};
        resMsg.headers = resMsgHeaders;
      }
      logger.debug('Limit: %d Remaining: %d Reset: %d', limit, remaining, reset);
      resMsgHeaders['X-RateLimit-Limit'] = limit;
      resMsgHeaders['X-RateLimit-Remaining'] = remaining;
      resMsgHeaders['X-RateLimit-Reset'] = reset;
      return resMsg;
    }
  };
