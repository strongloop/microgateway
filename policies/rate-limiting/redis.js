'use strict';
var RateLimiter = require('rolling-rate-limiter');
var redis = require('redis');
var handleResponse = require('./helper').handleResponse;
var debug = require('debug')('policy:rate-limiting');

module.exports = function(options) {
  options = options || {};
  var redisOptions = options.redis || {};
  var client = // redisOptions.client ||
    redis.createClient(redisOptions);

  var limit = options.limit;
  var interval = options.interval;
  var reject = options.reject;

  var limiter = RateLimiter({
    redis: client,
    namespace: options.prefix,
    interval: interval,
    maxInInterval: limit
  });

  var hardLimit = options.hardLimit;

  return function(props, context, flow) {

    var key = options.getKey(context);
    debug('Key: %s', key);
    if (!key) {
      return flow.proceed();
    }
    limiter(key, function(err, timeLeft) {
      if (err) {
        return flow.fail(err);
      }
      let remaining = timeLeft > 0 ? 0 : options.limit;
      handleResponse(limit, remaining, timeLeft, reject, context, flow);
    });
  };
};
