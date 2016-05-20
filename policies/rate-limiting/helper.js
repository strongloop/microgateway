// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
  .child({loc: 'microgateway:policies:rate-limiting:helper'});

exports.handleResponse =
  function(name, limit, remaining, reset, reject, context, flow) {
    if (remaining < 0 && reject) {
//      var resMsg = setupHeaders();
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

    function splice(base, pos, insert) {
      return base.substring(0, position) + insert + base(position);
    }

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
      name = name || 'RateLimit';
      logger.debug('Name %s Limit: %d Remaining: %d Reset: %d', name, limit, remaining, reset);
      var prefix;
      if (!resMsgHeaders['X-RateLimit-Limit']) {
        if (name === 'x-ibm-unnamed-rate-limit') {
          prefix = '';
        } else {
          prefix = 'name=' + name + ',';
        }
        // First item in list, "<value>" for single, "name=<name>,<value>" for multi-level
        resMsgHeaders['X-RateLimit-Limit'] = prefix + limit;
        resMsgHeaders['X-RateLimit-Remaining'] = prefix + remaining;
        resMsgHeaders['X-RateLimit-Reset'] = prefix + reset;
      } else {
        if (name === 'x-ibm-unnamed-rate-limit') {
          // Insert single value at beginning: "<value>; "
          resMsgHeaders['X-RateLimit-Limit'] = splice(resMsgHeaders['X-RateLimit-Limit'],
                                                      resMsgHeaders['X-RateLimit-Limit'].indexOf('=') + 1,
                                                      limit + '; ');
          resMsgHeaders['X-RateLimit-Remaining'] = splice(resMsgHeaders['X-RateLimit-Limit'],
                                                          resMsgHeaders['X-RateLimit-Limit'].indexOf('=') + 1,
                                                          remaining + '; ');
          resMsgHeaders['X-RateLimit-Reset'] = splice(resMsgHeaders['X-RateLimit-Limit'],
                                                      resMsgHeaders['X-RateLimit-Limit'].indexOf('=') + 1,
                                                      reset + '; ');
        } else {
          // Append multi-level value at end: "; name=<name>,<value>"
          prefix = '; name=' + name + ',';
          resMsgHeaders['X-RateLimit-Limit'] += prefix + limit;
          resMsgHeaders['X-RateLimit-Remaining'] += prefix + remaining;
          resMsgHeaders['X-RateLimit-Reset'] += prefix + reset;
        }
      }
      return resMsg;
    }
  };
