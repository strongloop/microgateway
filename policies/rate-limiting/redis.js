// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var RateLimiter = require('rolling-rate-limiter');
var redis = require('redis');
var handleResponse = require('./helper').handleResponse;
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:policies:rate-limiting:redis' });

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
    maxInInterval: limit });

  return function(props, context, flow) {
    var key = options.getKey();
    logger.debug('Key: %s', key);
    if (!key) {
      return flow.proceed();
    }

    var fields = key.split(':');
    var name = fields[fields.length - 1];
    limiter(key, function(err, timeLeft, remaining) {
      if (err) {
        return flow.fail(err);
      }
      logger.debug('Result: %d %d', timeLeft, remaining);
      handleResponse(name, limit, remaining, timeLeft, reject, context, flow);
    });
  };
};
