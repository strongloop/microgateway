// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:policies:rate-limiting:helper' });

exports.handleResponse =
  function(name, limit, remaining, reset, reject, context, flow) {
    if (remaining < 0 && reject) {
      setupHeaders();
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
      return base.substring(0, pos) + insert + base(pos);
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
      var dispRemaining = remaining >= 0 ? remaining : 0;
      var dispReset = Math.floor(reset / 1000);
      logger.debug('Name %s Limit: %d Remaining: %d Reset: %d', name, limit, dispRemaining, dispReset);
      var prefix;
      if (reject && remaining < 0 && resMsgHeaders['X-RateLimit-Limit']) {
        // On reject we only want the rateLimit that caused it
        resMsgHeaders['X-RateLimit-Limit'] = '';
        resMsgHeaders['X-RateLimit-Remaining'] = '';
        resMsgHeaders['X-RateLimit-Reset'] = '';
      }

      if (!resMsgHeaders['X-RateLimit-Limit']) {
        if (name === 'x-ibm-unnamed-rate-limit') {
          prefix = '';
        } else {
          prefix = 'name=' + name + ',';
        }
        // First item in list, "<value>" for single, "name=<name>,<value>" for multi-level
        resMsgHeaders['X-RateLimit-Limit'] = prefix + limit;
        resMsgHeaders['X-RateLimit-Remaining'] = prefix + dispRemaining;
        if (remaining < 0) {
          resMsgHeaders['X-RateLimit-Reset'] = prefix + dispReset;
        }
      } else if (name === 'x-ibm-unnamed-rate-limit') {
        // Insert single value at beginning: "<value>; "
        resMsgHeaders['X-RateLimit-Limit'] =
            splice(resMsgHeaders['X-RateLimit-Limit'],
                   resMsgHeaders['X-RateLimit-Limit'].indexOf('=') + 1,
                   limit + '; ');
        resMsgHeaders['X-RateLimit-Remaining'] =
            splice(resMsgHeaders['X-RateLimit-Remaining'],
                   resMsgHeaders['X-RateLimit-Remaining'].indexOf('=') + 1,
                   dispRemaining + '; ');
        if (remaining < 0) {
          resMsgHeaders['X-RateLimit-Reset'] =
              splice(resMsgHeaders['X-RateLimit-Reset'],
                     resMsgHeaders['X-RateLimit-Reset'].indexOf('=') + 1,
                     dispReset + '; ');
        }
      } else {
        // Append multi-level value at end: "; name=<name>,<value>"
        prefix = '; name=' + name + ',';
        resMsgHeaders['X-RateLimit-Limit'] += prefix + limit;
        resMsgHeaders['X-RateLimit-Remaining'] += prefix + dispRemaining;
        if (remaining < 0) {
          resMsgHeaders['X-RateLimit-Reset'] += prefix + dispReset;
        }
      }
      return resMsg;
    }
  };
