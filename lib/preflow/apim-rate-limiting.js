/**
 * Rate-limiting for product plans
 */
var rateLimitingPolicyFactory = require('../../policies/rate-limiting');

module.exports = function(options) {
  return function(ctx, cb) {
    var handler = rateLimitingPolicyFactory(options);
    var flow = {
      proceed: function() {
        cb();
      },
      fail: function(err) {
        cb(err);
      }
    }
    return handler({}, ctx, flow);
  };
};