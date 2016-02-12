'use strict'
var request = require('request');
var debug = require('debug')('micro-gateway:datastore:client');
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
      debug('error: ', error);
      //debug('body: %j', body);
      //debug('response: %j', response);
      if (error) {
        reject(Error(error));
        return;
      }
      var catalogs = JSON.parse(body);
      debug('catalog returned: %j', catalogs);
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
  debug('grabAPI entry');
  var snapshotFilter = '{"snapshot-id": "' + context.context.snapshot + '"}';
  var apiFilter = '{"id": "' + context.context.api.id + '"}';
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
      debug('error: ', error);
      // debug('body: %j' , body);
      // debug('response: %j' , response);
      if (error) {
        callback(error);
        debug('grabAPI error exit');
        return;
      }
      try {
        api = JSON.parse(body);
      } catch (e) {
        callback(e, null);
        return;
      }
      debug('grabAPI request exit');
      callback(null, api[0]); // there should only be one result
    }
  );
  debug('grabAPI exit');
}

exports.getCurrentSnapshot = function() {
  debug('getCurrentSnapshot entry');
  // build request to send to data-store
  const port = process.env['DATASTORE_PORT'];
  const queryurl = `http://${host}:${port}/api/snapshots/current`;

  // send request to optimizedData model from data-store
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, (error, response, body) => {
      debug('error: ', error);
      //debug('body: %j', body);
      //debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      var snapshot = JSON.parse(body);
      debug('snapshot: ', snapshot.snapshot.id);
      resolve(snapshot.snapshot.id);
    });
  });
}

exports.getTlsProfile = function(snapshot, tlsProfleName) {
  debug('getTlsProfile entry snapshot:' + snapshot +
                              '\n tlsProfleName:' + tlsProfleName );
  // build request to send to data-store
  let snapshotFilter = `{"snapshot-id": "${snapshot }"}`;
  let tlsNameFilter = `{"name": "${tlsProfleName }"}`;
  let queryfilter = `{"where": { "and":[${snapshotFilter}, ${tlsNameFilter}]}}`;
  const port = process.env['DATASTORE_PORT'];

  let queryurl = `http://${host}:${port}/api/tlsprofiles?filter=${encodeURIComponent(queryfilter)}`;

  // send request to data-store to get the reqiested TLS Profile
  // for matching API(s)
  return new Promise((resolve, reject) => {
    request({url: queryurl}, function (error, response, body) {
      debug('error: ', error);
      debug('body: %j', body);
      debug('response: %j', response);
      // exit early on error
      if (error) {
        reject(new Error(error));
        return;
      }
      resolve(JSON.parse(body));

    });
  });
}
