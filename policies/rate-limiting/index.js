// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var moment = require('moment');
var redisLimiter = require('./redis');
var tokenBucketLimiter = require('./token-bucket');
var logger = require('apiconnect-cli-logger/logger.js')
  .child({loc: 'microgateway:policies:rate-limiting'});
var assert = require('assert');
var env = require('../../utils/environment');

module.exports = function(options) {
  options = options || {};
  logger.debug('rate limiting policy is configured: %j', options);

  var limit = options.requests || options.limit || 1000;
  var period = options.period || options.interval || 1;
  var unit = options.unit || 'hour';

  if (typeof options.value === 'string') {
    /*
     * The value can be one of the following formats
     * 100 ==> 100/1hour
     * 100/1 ==> 100/1hour
     * 100/1/hour ==> 100/1hour
     * Spaces are ignored
     */
    var pattern = /^([\d\s]+)(?:\/([\d\s]*)([a-zA-Z\s]*))?$/;
    var parts = pattern.exec(options.value);
    assert(parts, 'Rate limit value is invalid: ' + options.value);
    limit = Number(parts[1]) || limit;
    period = Number(parts[2]) || period;
    unit = (parts[3] || unit).trim();
  }

  // moment.duration does not like 'min' as a unit of measure, convert to 'm'
  // See http://momentjs.com/docs/#/durations/creating/
  switch (unit) {
    case 'min':
    case 'mins':
      unit = 'm';
      break;
    case 'sec':
    case 'secs':
      unit = 's';
      break;
    case 'yr':
    case 'yrs':
      unit = 'y';
      break;
    case 'hr':
    case 'hrs':
      unit = 'h';
      break;
    case 'wk':
    case 'wks':
      unit = 'w';
      break;
  }

  var interval = moment.duration(period, unit).asMilliseconds();
  var reject = options['reject'] || options['hard-limit'] || false;

  logger.debug('Limit: %d/%d%s Reject: %s', limit, period, unit, reject);

  var config = {
    limit: limit,
    interval: interval,
    reject: reject,
    prefix: options.prefix || ('ibm-microgateway-' + Date.now()),
    redis: options.redis,
    getKey: getKey
  };

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
      url: process.env[env.RATELIMIT_REDIS]
    };
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
   * @param {Context} context The context object
   * @returns {string} The rate limiting key
   */
  function getKey(context) {
    context = context || {};
    var flowContext = context.flowContext || {};
    var client = flowContext.client || {};
    var clientApp = client.app || {};
    var clientId = clientApp.id;
    if (clientId == null) {
      return null;
    }
    // Use the scope as the namespace. The scope contains information about the
    // plan or operation path
    var scope = config.scope;
    scope = scope || '*';
    return scope + ':' + clientId;
  }

};
