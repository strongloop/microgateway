'use strict'
var request = require('request');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore:client'});
const host = '127.0.0.1'; // data-store's listening interface

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

  var queryurl = 'http://' + host + ':' + process.env['DATASTORE_PORT'] +
      '/api/catalogs?filter=' + encodeURIComponent(queryfilter);

  return new Promise((resolve, reject) => {
    request({url: queryurl}, (error, response, body) => {
      logger.debug('error: ', error);
      //logger.debug('body: %j', body);
      //logger.debug('response: %j', response);
      if (error) {
        reject(Error(error));
        return;
      }
      var catalogs = JSON.parse(body);
      logger.debug('catalog returned: %j', catalogs);
      if (catalogs.length === 1) {
        resolve(catalogs[0].name);
      } else {
        resolve(null);
      }
    });
  });
}

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
  var queryurl = 'http://' + host + ':' + process.env['DATASTORE_PORT'] +
      '/api/apis?filter=' + encodeURIComponent(queryfilter);
  var api = {};

  request(
    {
      url : queryurl
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
      try {
        api = JSON.parse(body);
      } catch (e) {
        callback(e, null);
        return;
      }
      logger.debug('grabAPI request exit');
      callback(null, api[0]); // there should only be one result
    }
  );
  logger.debug('grabAPI exit');
}

exports.getCurrentSnapshot = function() {
  logger.debug('getCurrentSnapshot entry');
  // build request to send to data-store
  const port = process.env['DATASTORE_PORT'];
  const queryurl = `http://${host}:${port}/api/snapshots/current`;

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, (error, response, body) => {
      logger.debug('error: ', error);
      //logger.debug('body: %j', body);
      //logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      var snapshot = JSON.parse(body);
      logger.debug('snapshot: ', snapshot.snapshot.id);
      resolve(snapshot.snapshot.id);
    });
  });
}

exports.releaseCurrentSnapshot = function(id) {
  logger.debug('releaseCurrentSnapshot entry');
  // build request to send to data-store
  const port = process.env['DATASTORE_PORT'];
  const queryurl = `http://${host}:${port}/api/snapshots/release?id=${id}`;

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, (error, response, body) => {
      logger.debug('error: ', error);
      logger.debug('body: %j', body);
      logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        logger.debug('releaseCurrentSnapshot error');
        reject(new Error(error));
        return;
      }
      logger.debug('releaseCurrentSnapshot exit');
      resolve(id);
    });
  });
}

exports.getTlsProfile = function(snapshot, tlsProfleName) {
  logger.debug('getTlsProfile entry snapshot:' + snapshot +
                              '\n tlsProfleName:' + tlsProfleName );
  // build request to send to data-store
  var snapshotFilter = `{"snapshot-id": "${snapshot }"}`;
  var tlsNameFilter = `{"name": "${tlsProfleName }"}`;
  var queryfilter = `{"where": { "and":[${snapshotFilter}, ${tlsNameFilter}]}}`;
  const port = process.env['DATASTORE_PORT'];

  var queryurl = `http://${host}:${port}/api/tlsprofiles?filter=${encodeURIComponent(queryfilter)}`;

  // send request to data-store to get the reqiested TLS Profile
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, function (error, response, body) {
      logger.debug('error: ', error);
      logger.debug('body: %j', body);
      logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(JSON.parse(body));

    });
  });
}

exports.getRegistry = function(snapshot, registryName) {
  logger.debug('getRegistry entry snapshot:' + snapshot +
                              '\n registryName:' + registryName );
  // build request to send to data-store
  var snapshotFilter = `{"snapshot-id": "${snapshot }"}`;
  var registryNameFilter = `{"name": "${registryName }"}`;
  var queryfilter = `{"where": { "and":[${snapshotFilter}, ${registryNameFilter}]}}`;
  const port = process.env['DATASTORE_PORT'];

  var queryurl = `http://${host}:${port}/api/registries?filter=${encodeURIComponent(queryfilter)}`;

  // send request to data-store to get the requested Registry Profile
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, function (error, response, body) {
      logger.debug('error: ', error);
      logger.debug('body: %j', body);
      logger.debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(JSON.parse(body));

    });
  });
}
