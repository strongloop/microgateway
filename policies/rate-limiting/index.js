// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var redisLimiter = require('./redis');
var tokenBucketLimiter = require('./token-bucket');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:policies:rate-limiting' });
var env = require('../../utils/environment');
var getInterval = require('./get-interval');

module.exports = function(options) {
  options = options || {};
  logger.debug('rate limiting policy is configured: %j', options);

  var limit = options.requests || options.limit || 1000;
  var period = options.period || options.interval || 1;
  var unit = options.unit || 'hour';

  var parsed = getInterval(limit, period, unit, options.value);

  var reject = options['reject'] || options['hard-limit'] || false;

  logger.debug('Reject: %s', reject);

  var config = {
    limit: parsed.limit,
    interval: parsed.interval,
    reject: reject,
    prefix: options.prefix || ('ibm-microgateway-' + Date.now()),
    redis: options.redis,
    getKey: getKey };

  for (var i in options) {
    if (config[i] === undefined) {
      config[i] = options[i];
    }
  }

  if (process.env[env.RATELIMIT_REDIS]) {
    /*
     The URL of the Redis server.
     Format: [redis:]//[[user][:password@]][host][:port][/db-number][?db=db-number[&password=bar[&option=value]]]
     */
    config.redis = {
      url: process.env[env.RATELIMIT_REDIS] };
  }

  if (config.redis) {
    logger.debug('Create a redis based rate limiter: %j', config);
    return redisLimiter(config);
  } else {
    logger.debug('Create a local token bucket based rate limiter: %j', config);
    return tokenBucketLimiter(config);
  }

  /**
   * Build the key for rate limiting from the context object
   * @returns {string} The rate limiting key
   */
  function getKey() {
    // Use the scope as the namespace. The scope contains information about the
    // plan or operation path
    var scope = config.scope;
    scope = scope || '*';
    return scope;
  }

};
