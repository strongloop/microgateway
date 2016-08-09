// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var supertest = require('supertest');
var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');

/**
 * clean up the directory after running the test suite
 */
function dsCleanup(port) {
  // clean up the directory
  return new Promise(function(resolve, reject) {
    var expect = { snapshot: {} };
    var datastoreRequest = supertest('http://localhost:' + port);
    dsCleanupFile();
    datastoreRequest
      .get('/api/snapshots')
      .end(function(err, res) {
        assert(!err, 'Unexpected error with dsCleanup()');

        var snapshotID = res.body[0].id;
        datastoreRequest
          .get('/api/snapshots/release?id=' + snapshotID)
          .end(function(err, res) {
            assert(!err, 'Unexpected error with dsCleanup()');

            try {
              assert(_.isEqual(expect, res.body));
              resolve();
            } catch (error) {
              reject(error);
            }
          });
      });
  });
}

/**
 * clean up the temporary file
 */
function dsCleanupFile(port) {
  try {
    var myPath = process.env.CONFIG_DIR || './';
    fs.unlinkSync(path.resolve(myPath, '.datastore'));
  } catch (e) {
    // ignore error;
  }
}

module.exports = {
  dsCleanup: dsCleanup,
  dsCleanupFile: dsCleanupFile };

