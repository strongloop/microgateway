'use strict';

var _ = require('lodash');
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var echo = require('./support/echo-server');
var supertest = require('supertest');
var microgw = require('../lib/microgw');
var apimServer = require('./support/mock-apim-server/apim-server');

describe('data-store', function() {
  var request;
  var snapshotID, oldSnapshotID;
  before(function(done) {
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8890;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';
    echo.start(8889)
      .then(function() { return apimServer.start('127.0.0.1', 8890); } )
      .then(function() { return microgw.start(3000); } )
      .then(function() {
        request = supertest('http://localhost:5000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_PORT;
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
    microgw.stop()
      .then(function() { echo.stop(); } )
      .then(function() { apimServer.stop(); })
      .then(done, done)
      .catch(done);
  });

  function verifyResponseArray(res, expected) {
    assert.strictEqual(res.length, expected.length);
    var current = -1;
    var usedvalues = new Array(res.length);
    _.fill(usedvalues, false);

    for(var i = 0; i < expected.length; i++) {
      var expect = expected[i];
      for (var j = 0; j < res.length; j++) {
        if (usedvalues[j] === true)
          continue;
        if(_.isMatch(res[j], expect)) {
          var actual = res[j];
          usedvalues[j] = true;
          for (var prop in expect) {
            if (expect.hasOwnProperty(prop)) {
              assert.strictEqual(actual[prop], expect[prop]);
            }
          }
          if(current === -1 && actual.current === true) {
            current = j;
          }
        }
      }
    }
    for(var k = 0; k < usedvalues.length; k++) {
      assert(usedvalues[k] === true);
    }
    return current;
  }

  function verifyResponseSingle(res, expected) {
    for (var prop in expected) {
      if (expected.hasOwnProperty(prop)) {
         assert.strictEqual(res[prop], expected[prop]);
      }
    }
  }

  it('snapshots should have single current entry with ref count of 1',
    function(done) {
      var expect = [{refcount : '1', current: true}];
      request
        .get('/api/snapshots')
        .expect(function(res) {
            verifyResponseArray(res.body, expect);
            snapshotID = res.body[0].id;
            assert(snapshotID.length === 5); // ID's are strings of 5 characters
            assert(parseInt(snapshotID) >= 0); // ID's are >= 0
            assert(parseInt(snapshotID) < 65536); // ID's are < 65536
          }
        ).end(done);
    }
  );
  it('current should return current snapshot and increment ref count',
    function(done) {
      var expect = {refcount : '2', current: true};
      request
        .get('/api/snapshots/current')
        .expect(function(res) {
            verifyResponseSingle(res.body.snapshot, expect);
            assert.strictEqual(res.body.snapshot.id, snapshotID); // ID should be same as previous
          }
        ).end(done);
    }
  );
  it('current should return current snapshot and increment ref count again',
    function(done) {
      var expect = {refcount : '3', current: true};
      request
        .get('/api/snapshots/current')
        .expect(function(res) {
            verifyResponseSingle(res.body.snapshot, expect);
            assert.strictEqual(res.body.snapshot.id, snapshotID); // ID should be same as previous
          }
        ).end(function (err, res) {
            if (err) return done(err);
            setTimeout(
              done,
              20000 // 15 seconds to ensure second snapshot begins
            );
          }
        );
    }
  );
  it('snapshots should have two entries with previous entry no longer current',
    function(done) {
      var expect = [{refcount : '2', current: false}, // ref count decreased AND
                                                      // no longer current
                    {refcount : '1', current: true}];
      request
        .get('/api/snapshots')
        .expect(function(res) {
            var curr = verifyResponseArray(res.body, expect);
            var old = curr > 0 ? 0 : 1;
            oldSnapshotID = snapshotID;
            snapshotID = res.body[curr].id;
            assert(res.body[old].id === oldSnapshotID);
            assert(oldSnapshotID !== snapshotID);
            assert(snapshotID.length === 5); // ID's are strings of 5 characters
            assert(parseInt(snapshotID) >= 0); // ID's are >= 0
            assert(parseInt(snapshotID) < 65536); // ID's are < 65536
          }
        ).end(done);
    }
  );
  it('release should return old snapshot and decrement ref count',
    function(done) {
      var expect = {refcount : '1', current: false};
      request
        .get('/api/snapshots/release?id=' + oldSnapshotID)
        .expect(function(res) {
            verifyResponseSingle(res.body.snapshot, expect);
            assert(res.body.snapshot.id === oldSnapshotID); // ID should be same as previous
          }
        ).end(done);
    }
  );
  it('release should remove old snapshot and decrement ref count and cleanup dir',
    function(done) {
      var expect = {snapshot : {}};
      request
        .get('/api/snapshots/release?id=' + oldSnapshotID)
        .expect(function(res) {
            assert(_.isEqual(expect, res.body));
            
          }
        ).end(function (err, res) {
            if (err) return done(err);
            setTimeout(
              function () {
                // check for non existence of directory
                try {
                  var stats = fs.statSync(process.env['ROOTCONFIGDIR'] + oldSnapshotID);
                } catch (e) {
                  if(e.code === 'ENOENT') return done(); // expected
                }
                done(new Error('Snapshot directory still exists'));
              },
              1500 // 1.5 seconds to cleanup
            );
          }
        );
    }
  );
  it('release should remove current snapshot and decrement ref count and cleanup dir',
    function(done) {
      var expect = {snapshot : {}};
      request
        .get('/api/snapshots/release?id=' + snapshotID)
        .expect(function(res) {
            assert(_.isEqual(expect, res.body));
            
          }
        ).end(function (err, res) {
            if (err) return done(err);
            setTimeout(
              function () {
                // check for non existence of directory
                try {
                  var stats = fs.statSync(process.env['ROOTCONFIGDIR'] + snapshotID);
                } catch (e) {
                  if(e.code === 'ENOENT') return done(); // expected
                }
                done(new Error('Snapshot directory still exists'));
              },
              1500 // 1.5 seconds to cleanup
            );
          }
        );
    }
  );

});
