// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var supertest = require('supertest');
var assert = require('assert');
var _ = require('lodash');

/**
 * clean up the directory after running the test suite
 */
function dsCleanup(port) {
  // clean up the directory
  return new Promise(function(resolve, reject) {
    var expect = { snapshot: {} };
    var datastoreRequest = supertest('http://localhost:' + port);
    datastoreRequest
      .get('/api/snapshots')
      .end(function(err, res) {
        assert(!err);

        var snapshotID = res.body[0].id;
        datastoreRequest
          .get('/api/snapshots/release?id=' + snapshotID)
          .end(function(err, res) {
            assert(!err);

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

module.exports = {
  dsCleanup: dsCleanup };

