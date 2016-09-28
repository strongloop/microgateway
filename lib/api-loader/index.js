// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var async = require('async');
var request = require('request');
var url = require('url');
var lru = require('lru-cache');
var dsc = require('../../datastore/client');
var Promise = require('bluebird');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:api-loader' });

//hold a few snapshots to prevent thrashing when snapshots update
var optimizedDataCache = lru({ max: 3 });

//data store address
var dsHost = '127.0.0.1';
var dsPort;

/*
 * The "api-loader" middlware reads the optimizedData from the current snapshot
 * and saves it under the context object.
 */
module.exports = function createApiLoaderMiddleware(options) {
  logger.debug('api-loader middleware options: ', options);
  options = options || {};

  return function(req, res, next) {
    logger.debug('api-loader entry');
    dsPort = process.env.DATASTORE_PORT;

    async.waterfall([
      //get the current snapshot id
      function(callback) {
        dsc.getCurrentSnapshot().then(function(ssid) {
          //release the snapshot after the transaction is done
          res.on('finish', function() {
            logger.debug('api-loader released the snapshot:', ssid);
            dsc.releaseCurrentSnapshot(ssid);
          });

          callback(null, ssid);
        })
        .catch(callback);
      },

      //get the optimizedData
      function(snapshotId, callback) {
        doOptimizedDataRequest(snapshotId)
          .then(function(apis) {
            callback(undefined, apis);
          })
          .catch(callback);
      } ],

      //save the optimizedData under the context object
      function(err, apis) {
        if (err) {
          logger.error('api-loader failed to read optimizedData:', err);
          next(err);
        } else {
          var size = Array.isArray(apis) ? apis.length : 0;
          if (size === 0) {
            logger.error('api-loader failed to load any API');

            //404: Not found
            req.ctx.set('error.status.code', 404);
            return next(
                    { name: 'PreFlowError',
                      message: 'unable to process the request' });
          }

          logger.debug('api-loader ends with %s API(s) retreived:', size);
          //TODO: should we move it to the request objecet instead of context?
          req.ctx._apis = apis;
          next();
        }
      }
    );
  };
};

/*
 * Get the optimizedData from the data-store.
 *
 * @return: a Promise object is returned. It should resolve with optimizedData.
 */
function doOptimizedDataRequest(snapshotId) {
  var optimizedJson = optimizedDataCache.get(snapshotId);
  if (optimizedJson) {
    logger.debug('api-loader doOptimizedDataRequest cache hits (snapshotId=%d)!', snapshotId);

    //The optimizedData was cached earlier.
    return new Promise(function(resolve, reject) {
      var result = JSON.parse(optimizedJson);
      return resolve(result);
    });
  }

  logger.debug('api-loader doOptimizedDataRequest begins (snapshotId=%d).', snapshotId);
  //Get the optimizedData model from the data-store
  return new Promise(function(resolve, reject) {
    //Build the request options first
    var queryfilter = { where: { and: [] } };
    queryfilter.where.and[0] = { 'snapshot-id': snapshotId };

    var queryurlObj = {
      protocol: 'http',
      hostname: dsHost,
      port: dsPort,
      pathname: '/api/optimizedData',
      query: { filter: JSON.stringify(queryfilter) } };
    var queryurl = url.format(queryurlObj);

    request({ url: queryurl }, function(error, response, body) {
      if (error) {
        logger.error('api-loader doOptimizedDataRequest error: ', error);

        var reason = { name: 'PreFlowError',
            message: 'Runtime error: ' + (error.message || error.toString()) };
        return reject(reason);
      }

      // Keep the response in cache (only after the JSON.parse succeeds)
      optimizedDataCache.set(snapshotId, body);

      var result = JSON.parse(body);
      return resolve(result);
    });
  });
}

