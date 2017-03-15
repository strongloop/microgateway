// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var supertest = require('supertest');
var mg = require('../lib/microgw');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('throw policy', function() {
  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/throw';
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
    mg.start(3000)
      .then(function() {
        request = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanupFile();
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('throw-and-catch', function(done) {
    request
      .get('/throw/basic')
      .set('X-ERROR-ID', 'foo')
      .expect(200, /Caught the foo error: Throw on purpose/, done);
  });

  it('throw-without-catch', function(done) {
    request
      .get('/throw/basic')
      .set('X-ERROR-ID', 'bar')
      .expect(500, /{"name":"bar","message":"Throw on purpose"}/, done);
  });
});

