/**
 * Rate-limiting for product plans
 */
var rateLimitingPolicyFactory = require('../../policies/rate-limiting');

module.exports = function(options) {
  var handler = rateLimitingPolicyFactory(options);

  return function(ctx, cb) {
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