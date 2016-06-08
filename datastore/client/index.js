// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var Promise = require('bluebird');
var request = require('request');
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:datastore:client'});
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
  var queryfilter =
      '{"where": { "and":[' +
      snapshotFilter + ',' +
      orgNameFilter + ',' +
      defaultOrgFilter + ']}}';

  var queryurlObj = {
        protocol: 'http',
        hostname: host,
        port: process.env.DATASTORE_PORT,
        pathname: '/api/catalogs',
        query: {filter : queryfilter}
  };
  var queryurl = url.format(queryurlObj);

  return new Promise(function(resolve, reject) {
    request({url: queryurl, json: true}, function(error, response, body) {
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
  var queryfilter =
      '{"where": { "and":[' +
      snapshotFilter + ',' +
      apiFilter + ']}}';
  var queryurlObj = {
        protocol: 'http',
        hostname: host,
        port: process.env.DATASTORE_PORT,
        pathname: '/api/apis',
        query: {filter : queryfilter}
  };
  var queryurl = url.format(queryurlObj);
  var api = {};

  request(
    {
      url : queryurl,
      json: true
    },
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
    }
  );
  logger.debug('grabAPI exit');
};

exports.getCurrentSnapshot = function() {
  logger.debug('getCurrentSnapshot entry');
  // build request to send to data-store
  var queryurlObj = {
        protocol: 'http',
        hostname: host,
        port: process.env.DATASTORE_PORT,
        pathname: '/api/snapshots/current'
  };
  var queryurl = url.format(queryurlObj);
  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({url: queryurl, json: true}, function(error, response, body) {
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
        query: {id : id}
  };
  var queryurl = url.format(queryurlObj);

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({url: queryurl}, function(error, response, body) {
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
  logger.debug('getTlsProfile entry snapshot:', snapshot,
                              '\n tlsProfleName:', tlsProfleName );
  // build request to send to data-store
  var queryfilter = JSON.stringify({
    where: {
      and: [
        { 'snapshot-id': snapshot},
        { name: tlsProfleName}
      ]
    }
  });

  var queryurlObj = {
        protocol: 'http',
        hostname: host,
        port: process.env.DATASTORE_PORT,
        pathname: '/api/tlsprofiles',
        query: {filter : queryfilter}
  };
  var queryurl = url.format(queryurlObj);

  // send request to data-store to get the reqiested TLS Profile
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({url: queryurl, json: true}, function (error, response, body) {
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
  logger.debug('getRegistry entry snapshot:', snapshot,
                              '\n registryName:', registryName );
  // build request to send to data-store
  var queryfilter = JSON.stringify({
    where: {
      and: [
        { 'snapshot-id': snapshot},
        { name: registryName}
      ]
    }
  });

  var queryurlObj = {
        protocol: 'http',
        hostname: host,
        port: process.env.DATASTORE_PORT,
        pathname: '/api/registries',
        query: {filter : queryfilter}
  };
  var queryurl = url.format(queryurlObj);

  // send request to data-store to get the requested Registry Profile
  // for matching API(s)
  return new Promise(function(resolve, reject) {
    request({url: queryurl, json: true}, function (error, response, body) {
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
