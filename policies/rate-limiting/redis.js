var RateLimiter = require('rolling-rate-limiter');
var redis = require('redis');

module.exports = function(options) {
  options = options || {};
  var redisOptions = options.redis || {};
  var client = // redisOptions.client ||
    redis.createClient(redisOptions);

  var limiter = RateLimiter({
    redis: client,
    namespace: options.prefix,
    interval: options.interval,
    maxInInterval: options.limit
  });

  return function(props, context, next) {

    var key = options.getKey(context);
    var res = context.res;
    limiter(key, function(err, timeLeft) {
      if (err) {
        return res.status(500).send(err);
      } else if (timeLeft) {
        return res.status(429).send("You must wait " + timeLeft +
          " ms before you can make requests.");
      } else {
        return next();
      }
    });

  };

};
