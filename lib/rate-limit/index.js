// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var async = require('async');
var rlutil = require('./util');
var rateLimiterCache = rlutil.limiterCache;
var createLimiter = rlutil.createLimiter;
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:rate-limit' });

/*
 * Read the rate-limit settings from the plan and apply it.
 */
module.exports = function createRateLimitMiddleware(options) {
  logger.debug('rate-limit middleware options: ', options);
  options = options || {};

  return function(req, res, next) {
    var ctx = req.ctx;
    var api = req.ctx._apis;

    // Seach rateLimit for an unlimited value
    var limited = false;
    if (api.rateLimits) {
      api.rateLimits.map(function(rateLimit, index) {
        var name = Object.keys(api.rateLimits[index]);
        if (rateLimit[name].value.toUpperCase() !== 'UNLIMITED') {
          limited = true;
        } else {
        }
      });
    }

    if (limited) {
      var tasks = api.rateLimits
        .filter(function(rateLimit, index) {
          // Filter out any "unlimited'
          var name = Object.keys(api.rateLimits[index]);
          return rateLimit[name].value.toUpperCase() !== 'UNLIMITED';
        }).map(function(thisRateLimit, index, newRateLimits) {
          var name = Object.keys(newRateLimits[index])[0];
          var rateLimit = thisRateLimit[name];
          rateLimit.scope = api.rateLimitScope;

          var client = api.client || {};
          var clientApp = client.app || {};
          var clientId = clientApp.id;
          if (clientId) {
            rateLimit.scope += ':' + clientId;
          }
          rateLimit.scope += ':' + name;
          rateLimit.name = name;

          return function(callback) {
            var limiter = rateLimiterCache[rateLimit.scope];
            if (!limiter) {
              limiter = createLimiter(rateLimit);
              rateLimiterCache[rateLimit.scope] = limiter;
            }

            limiter(ctx, function(err, result) {
              if (err) {
                // Limiter failed, stop processing
                logger.error('rate-limit: limit exceeded', rateLimit.name);
                callback(err);
              } else {
                // Next limiter
                callback();
              }
            });
          };
        });

      async.series(tasks, function(err) {
        next(err);
      });
    } else {
      next();
    }
  };
};

