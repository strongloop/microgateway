var debug = require('debug')('policy:rate-limiting');
var RateLimiter = require('limiter').RateLimiter;

module.exports = function(options) {
  options = options || {};

  var limit = options.limit;
  var interval = options.interval;
  var hardLimit = options.hardLimit;

  var limiters = {};

  return function inProcessRateLimiting(props, context, next) {
    var limiter;
    var key = options.getKey(context);
    debug('Key: %s', key);
    if (key) {
      limiter = limiters[key];
      if (!limiter) {
        debug('Creating rate limiter: %d %d', limit, interval);
        limiter = new RateLimiter(limit, interval);
        limiters[key] = limiter;
      }

      var ok = limiter.tryRemoveTokens(1);
      debug('Bucket: ', limiter.tokenBucket);
      var remaining = Math.floor(limiter.getTokensRemaining());
      var reset = Math.max(interval - (Date.now() - limiter.curIntervalStart),
        0);

      var res = context.res;
      debug('Limit: %d Remaining: %d Reset: %d', limit, remaining, reset);
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);

      if (!ok && hardLimit) {
        res.status(429).json({error: 'Limit exceeded'});
        return;
      }
    }
    next();
  };
};

