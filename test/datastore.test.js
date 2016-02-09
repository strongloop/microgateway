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
  microgw.start(3000, done);
}

describe('data-store', function() {
  before(startEchoServer);
  before(startAPImServer);
  before(startMicroGateway);

  function verifyResponse(res, expected) {
    assert.strictEqual(res.body.length, expected.length);

    for(var i = 0; i < expected.length; i++) {
      var expect = expected[i];
      var actual = res.body[i];
      for (var prop in expect) {
        if (expect.hasOwnProperty(prop)) {
          assert.strictEqual(actual[prop], expect[prop]);
        }
      }
    }
  }

  it('snapshots should have single current entry with ref count of 1',
    function(done) {
      var expect = [{refcount : '1', current: true}];
      request
        .get('/api/snapshots')
        .expect(function(res) {
            verifyResponse(res, expect);
          }
        ).end(done);
  });

});
