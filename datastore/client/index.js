// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var Promise = require('bluebird');
var request = require('request');
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:client' });
var host = '127.0.0.1'; // data-store's listening interface

/**
 * Finds the default catalog/environment for a specific provider
 * organization
 *
 * @param {string} snapshot - Snapshot identifier
 * @param {string} orgName - Name or provider organization
 */
exports.apimGetDefaultCatalog = function(snapshot, orgName) {
  var snapshotFilter = '{"snapshot-id": "' + snapshot + '"}';
  var orgNameFilter = '{"organization.name": "' + orgName + '"}';
  var defaultOrgFilter = '{"default": "true"}';
  var queryfilter = '{"where": {"and": [' +
      snapshotFilter + ',' + orgNameFilter + ',' + defaultOrgFilter + ']}}';

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/catalogs',
    query: { filter: queryfilter } };
  var queryurl = url.format(queryurlObj);

  return new Promise(function(resolve, reject) {
    request({ url: queryurl, json: true }, function(error, response, body) {
      logger.debug('error: ', error);
      //logger.debug('body: %j', body);
      //logger.debug('response: %j', response);
      if (error) {
        reject(error);
        return;
      }
      var catalogs = body;
      logger.debug('catalog returned: %j', catalogs);
      if (catalogs.length === 1) {
        resolve(catalogs[0].name);
      } else {
        resolve(null);
      }
    });
  });
};

/**
 * Adds flow information from API in the context
 *
 * @param {Object} context - context object
 * @param {callback} callback - The callback that handles the error
 *                              or output context
 */
exports.grabAPI = function(context, callback) {
  logger.debug('grabAPI entry');
  var snapshotFilter = '{"snapshot-id": "' + context.snapshot + '"}';
  var apiFilter = '{"id": "' + context.api.id + '"}';
  var queryfilter = '{"where": {"and": [' +
      snapshotFilter + ',' + apiFilter + ']}}';
  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/apis',
    query: { filter: queryfilter } };
  var queryurl = url.format(queryurlObj);
  var api = {};

  request(
    { url: queryurl, json: true },
    function(error, response, body) {
      logger.debug('error: ', error);
      // logger.debug('body: %j' , body);
      // logger.debug('response: %j' , response);
      if (error) {
        callback(error);
        logger.debug('grabAPI error exit');
        return;
      }
      api = body;
      logger.debug('grabAPI request exit');
      callback(null, api[0]); // there should only be one result
    });
  logger.debug('grabAPI exit');
};

exports.getCurrentSnapshot = function() {
  logger.debug('getCurrentSnapshot entry');
  // build request to send to data-store
  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/snapshots/current' };
  var queryurl = url.format(queryurlObj);
  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({ url: queryurl, json: true }, function(error, response, body) {
      logger.debug('error: ', error);
      //logger.debug('body: %j', body);
      //logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(error);
        return;
      }
      var snapshot = body;
      logger.debug('snapshot: ', snapshot.snapshot.id);
      resolve(snapshot.snapshot.id);
    });
  });
};

exports.releaseCurrentSnapshot = function(id) {
  logger.debug('releaseCurrentSnapshot entry');
  // build request to send to data-store
  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/snapshots/release',
    query: { id: id } };
  var queryurl = url.format(queryurlObj);

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({ url: queryurl }, function(error, response, body) {
      logger.debug('error: ', error);
      logger.debug('body: %j', body);
      logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        logger.debug('releaseCurrentSnapshot error');
        reject(error);
        return;
      }
      logger.debug('releaseCurrentSnapshot exit');
      resolve(id);
    });
  });
};

exports.getTlsProfile = function(snapshot, tlsProfleName) {
  logger.debug('getTlsProfile entry snapshot:', snapshot, '\n tlsProfleName:', tlsProfleName);
  // build request to send to data-store
  var queryfilter = JSON.stringify({
    where: { and: [ { 'snapshot-id': snapshot }, { name: tlsProfleName } ] } });

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/tlsprofiles',
    query: { filter: queryfilter } };
  var queryurl = url.format(queryurlObj);

  // send request to data-store to get the reqiested TLS Profile
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({ url: queryurl, json: true }, function(error, response, body) {
      logger.debug('error: ', error);
      logger.debug('body: %j', body);
      logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(error);
        return;
      }
      resolve(body);
    });
  });
};

exports.getRegistry = function(snapshot, registryName) {
  logger.debug('getRegistry entry snapshot:', snapshot, '\n registryName:', registryName);
  // build request to send to data-store
  var queryfilter = JSON.stringify({
    where: { and: [ { 'snapshot-id': snapshot }, { name: registryName } ] } });

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/registries',
    query: { filter: queryfilter } };
  var queryurl = url.format(queryurlObj);

  // send request to data-store to get the requested Registry Profile
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({ url: queryurl, json: true }, function(error, response, body) {
      logger.debug('error: ', error);
      logger.debug('body: %j', body);
      logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(error);
        return;
      }
      resolve(body);
    });
  });
};

exports.getAppInfo = function(snapshot, subscriptionId, clientId, done) {
  logger.debug('getAppInfo entry');
  //searching for the application info for the specific clientId
  var queryfilter = JSON.stringify({
    where: { and: [ { 'snapshot-id': snapshot }, { id: subscriptionId } ] } });

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/subscriptions',
    query: { filter: queryfilter } };

  var queryurl = url.format(queryurlObj);
  // send request to optimizedData model from data-store
  // for matching API(s)
  request({ url: queryurl, json: true }, function(error, response, body) {
    logger.debug('error: ', error);
    // exit early on error
    if (error) {
      done(error);
      return;
    }
    var subscriptions = body;
    //TODO: double check the clientId in the body.application['app-credentials'] ????
    if (!subscriptions || subscriptions.length === 0) {
      done(new Error('no matched application'));
      return;
    }
    var rev = subscriptions[0].application;
    logger.debug('found application record:', rev.title);
    //remove unnecessary fields before return
    var credential = rev['app-credentials'][0];
    delete rev['app-credentials'];
    rev['client-id'] = credential['client-id'];
    rev['client-secret'] = credential['client-secret'];
    done(undefined, rev);
  });
};

//Find clinet(s) by the client id and the application id.
function getClientById(snapshot, clientId, apiId, done) {
  logger.debug('getClientById entry');

  // build request to send to data-store
  var queryfilter = { where: { and: [] } };
  queryfilter.where.and[0] = { 'snapshot-id': snapshot };
  queryfilter.where.and[1] = { 'api-id': apiId };
  queryfilter.where.and[2] = { 'client-id': clientId };

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/optimizedData',
    query: { filter: JSON.stringify(queryfilter) } };
  var queryurl = url.format(queryurlObj);

  request({ url: queryurl, json: true }, function(error, response, body) {
    if (error) {
      logger.debug('error: ', error);
      return done(error);
    }

    var optimizedData = body;
    if (!optimizedData || optimizedData.length === 0) {
      return done('no matched client');
    }

    done(undefined, optimizedData);
  });
};
exports.getClientById = getClientById;

//Look up the subscriptions and search whether the given client subscribes the
//given API. If there is one, return the client information.
//
//It could be slow if there are many subscriptions. (TODO: optimization needed)
exports.getClientCredsById = function(snapshot, clientId, apiId, done) {
  logger.debug('getClientCredsById');

  // find all subscriptions of this snapshot
  var queryfilter = { where: { and: [] }, fields: {} };
  queryfilter.where.and[0] = { 'snapshot-id': snapshot };
  queryfilter.fields['application'] = true;
  queryfilter.fields['plan-registration'] = true;

  var queryurlObj = {
    protocol: 'http',
    hostname: host,
    port: process.env.DATASTORE_PORT,
    pathname: '/api/subscriptions',
    query: { filter: JSON.stringify(queryfilter) } };
  var queryurl = url.format(queryurlObj);

  request({ url: queryurl, json: true }, function(error, response, results) {
    if (error || !results) {
      return done(error);
    }

    //lookup in the returned subscriptions
    for (var idx = 0, len = results.length; idx < len; idx++) {
      var entry = results[idx];
      var appCreds = entry['application'] &&
                     entry['application']['app-credentials'];
      if (appCreds) {
        for (var idx2 = 0, len2 = appCreds.length; idx2 < len2; idx2++) {
          var appCred = appCreds[idx2];
          //see if the given client subscribes the plan
          if (clientId === appCred['client-id']) {
            var apis = entry['plan-registration'] &&
                       entry['plan-registration']['apis'];
            if (apis.length === 0) {
              //treat this as all apis are subscribed
              return done(undefined, appCred);
            } else {
              for (var idx3 = 0, len3 = apis.length; idx3 < len3; idx3++) {
                //see if the given api is included in the plan
                if (typeof apis[idx3] === 'object' && apis[idx3].id === apiId) {
                  return done(undefined, appCred);
                }
              }
            }
          }
        }
      }
    }

    //Give the last try to test the 'test-app' (auto subscription) from the optimizedData
    getClientById(snapshot, clientId, apiId, function(error, result) {
      if (error) {
        return done(error);
      }

      if (result) {
        var creds = {
          'client-id': result[0]['client-id'],
          'client-secret': result[0]['client-secret'],
        };

        return done(undefined, creds);
      }

      return done('no matched client');
    });
  });
};
