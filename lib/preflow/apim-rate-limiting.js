// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/**
 * Rate-limiting for product plans
 */
var rateLimitingPolicyFactory = require('../../policies/rate-limiting');

module.exports = function(options) {
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
      }
    };
    return handler({}, ctx, flow);
  };
};
