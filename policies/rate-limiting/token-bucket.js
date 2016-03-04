'use strict';
var debug = require('debug')('policy:rate-limiting');
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
    debug('Key: %s', key);
    if (key) {
      limiter = limiters[key];
      if (!limiter) {
        debug('Creating rate limiter: %d %d', limit, interval);
        // Use +1 so that we can treat remaining 0 as no more
        limiter = new RateLimiter(limit + 1, interval);
        limiters[key] = limiter;
      }

      var ok = limiter.tryRemoveTokens(1);
      debug('Bucket: ', limiter.tokenBucket);
      var remaining = Math.floor(limiter.getTokensRemaining());
      var reset = Math.max(interval - (Date.now() - limiter.curIntervalStart),
        0);

      handleResponse(limit, remaining, reset, reject, context, flow);
    } else {
      flow.proceed();
    }
  };
};

