'use strict';
var logger = require('../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:policies:rate-limiting:token-bucket'});
var RateLimiter = require('limiter').RateLimiter;
var handleResponse = require('./helper').handleResponse;

module.exports = function(options) {
  options = options || {};

  var limit = options.limit;
  var interval = options.interval;
  var hardLimit = options.hardLimit;

  var limiters = {};

  return function inProcessRateLimiting(props, context, next) {
    var limiter;
    var key = options.getKey(context);
    logger.debug('Key: %s', key);
    if (key) {
      limiter = limiters[key];
      if (!limiter) {
        logger.debug('Creating rate limiter: %d %d', limit, interval);
        limiter = new RateLimiter(limit, interval);
        limiters[key] = limiter;
      }

      var ok = limiter.tryRemoveTokens(1);
      logger.debug('Bucket: ', limiter.tokenBucket);
      var remaining = Math.floor(limiter.getTokensRemaining());
      var reset = Math.max(interval - (Date.now() - limiter.curIntervalStart),
        0);

      handleResponse(limit, remaining, reset, hardLimit, context, next);
    }
    next();
  };
};

