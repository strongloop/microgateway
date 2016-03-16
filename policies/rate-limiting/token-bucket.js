'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
  .child({loc: 'apiconnect-microgateway:policies:rate-limiting:token-bucket'});
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
    var key = options.getKey(context);
    logger.debug('Key: %s', key);
    if (key) {
      limiter = limiters[key];
      if (!limiter) {
        logger.debug('Creating rate limiter: %d %d', limit, interval);
        // Use +1 so that we can treat remaining 0 as no more
        limiter = new RateLimiter(limit, interval, true);
        limiters[key] = limiter;
      }

      limiter.removeTokens(1, function(err, remainingRequests) {
        logger.debug('Bucket: ', limiter.tokenBucket);
        var remaining = Math.floor(remainingRequests);
        var reset = Math.max(interval - (Date.now() - limiter.curIntervalStart),
          0);

        handleResponse(limit, remaining, reset, reject, context, flow);
      });
    } else {
      flow.proceed();
    }
  };
};
