// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:policies:rate-limiting:token-bucket' });
var RateLimiter = require('limiter').RateLimiter;
var handleResponse = require('./helper').handleResponse;

module.exports = function(options) {
  options = options || {};

  var limit = options.limit;
  var interval = options.interval;
  var reject = options.reject;

  var limiters = {};

  return function inProcessRateLimiting(props, context, flow) {
    var limiter;
    var key = options.getKey();
    logger.debug('Key: %s', key);
    var fields = key.split(':');
    var name = fields[fields.length - 1];
    if (key) {
      limiter = limiters[key];
      if (!limiter) {
        logger.debug('Creating rate limiter: %d %d', limit, interval);
        // Use +1 so that we can treat remaining 0 as no more
        limiter = new RateLimiter(limit, interval, true);
        limiters[key] = limiter;
      }

      limiter.removeTokens(1, function(err, remainingRequests) {
        if (err) { /* suppress eslint handle-callback-err */ }
        logger.debug('Bucket: ', limiter.tokenBucket);
        var remaining = Math.floor(remainingRequests);
        var reset = Math.max(interval - (Date.now() - limiter.curIntervalStart),
          0);

        handleResponse(name, limit, remaining, reset, reject, context, flow);
      });
    } else {
      flow.proceed();
    }
  };
};
