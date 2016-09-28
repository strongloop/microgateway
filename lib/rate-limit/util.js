// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var rateLimitingPolicyFactory = require('../../policies/rate-limiting');

//Cache of the created rate limiters
var rateLimiterCache = {};

//To create rate-limit policy
function createLimiter(options) {
  options = options || {};
  // The prefix should be unique per catalog
  options.prefix = options.prefix || 'ibm-microgateway';
  var handler = rateLimitingPolicyFactory(options);

  return function(ctx, cb) {
    var flow = {
      proceed: function() {
        cb();
      },
      fail: function(err) {
        cb(err);
      } };
    return handler({}, ctx, flow);
  };
};

//Reset the limiter cache.
//This is for mocha testing for cleanup. You should not call it otherwise
function resetLimiterCache() {
  for (var i in rateLimiterCache) {
    delete rateLimiterCache[i];
  }
}

module.exports = {
  createLimiter: createLimiter,
  limiterCache: rateLimiterCache,
  resetLimiterCache: resetLimiterCache };
