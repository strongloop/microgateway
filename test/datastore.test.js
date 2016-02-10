'use strict';

var _ = require('lodash');
var assert = require('assert');
var express = require('express');
var request = require('supertest')('http://localhost:5000');
var microgw = require('../lib/microgw');
var apimServer = require('./mock-apim-server/apim-server');

var echoServer = express();
echoServer.get('/*', function(req, resp) {
  resp.send(req.url);
});
echoServer.post('/*', function(req, resp) {
  req.pipe(resp);
});

function startEchoServer(done) {
  echoServer.listen(8889, done);
}

function startAPImServer(done) {
  apimServer.start('127.0.0.1', 8080, done);
}

function startMicroGateway(done) {
  process.env['DATASTORE_PORT'] = 5000;
  process.env['APIMANAGER'] = '127.0.0.1';
  process.env['APIMANAGER_PORT'] = 8080;
  microgw.start(3000, done);
}

describe('data-store', function() {
  before(startEchoServer);
  before(startAPImServer);
  before(startMicroGateway);

  function verifyResponseArray(res, expected) {
    assert.strictEqual(res.length, expected.length);

    for(var i = 0; i < expected.length; i++) {
      var expect = expected[i];
      var actual = res[i];
      for (var prop in expect) {
        if (expect.hasOwnProperty(prop)) {
          assert.strictEqual(actual[prop], expect[prop]);
        }
      }
    }
  }

  function verifyResponseSingle(res, expected) {
    for (var prop in expected) {
      if (expected.hasOwnProperty(prop)) {
         assert.strictEqual(res[prop], expected[prop]);
      }
    }
  }

  var snapshotID;
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
  it('current should return current snapshotID and increment ref count',
    function(done) {
      var expect = {refcount : '2', current: true};
      request
        .get('/api/snapshots/current')
        .expect(function(res) {
            verifyResponseSingle(res.body.snapshot, expect);
            assert(res.body.snapshot.id === snapshotID); // ID should be same as previous
          }
        ).end(done);
    }
  );

});
