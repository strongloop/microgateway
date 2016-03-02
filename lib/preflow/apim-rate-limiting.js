/**
 * Rate-limiting for product plans
 */
var rateLimitingPolicyFactory = require('../../policies/rate-limiting');

module.exports = function(options) {
  return rateLimitingPolicyFactory(options);
};