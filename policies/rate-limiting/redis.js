'use strict';
var RateLimiter = require('rolling-rate-limiter');
var redis = require('redis');
var handleResponse = require('./helper').handleResponse;

module.exports = function(options) {
  options = options || {};
  var redisOptions = options.redis || {};
  var client = // redisOptions.client ||
    redis.createClient(redisOptions);

  var limit = options.limit;
  var interval = options.interval;
  var hardLimit = options.hardLimit;

  var limiter = RateLimiter({
    redis: client,
    namespace: options.prefix,
    interval: interval,
    maxInInterval: limit
  });

  var hardLimit = options.hardLimit;

  return function(props, context, next) {

    var key = options.getKey(context);
    limiter(key, function(err, timeLeft) {
      if (err) {
        return next(err);
      }
      let remaining = timeLeft > 0 ? 0 : options.limit;
      handleResponse(limit, remaining, timeLeft, hardLimit, context, next);
    });

  };

};
