// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var async = require('async');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('operation rate limiting test', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/default';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
    mg.start(3000)
      .then(function() { return echo.start(8889); })
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
    delete process.env.CONFIG_DIR;
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
    echo.stop()
      .then(function() { return mg.stop(); })
      .then(done, done);
  });

  function tests(env) {
    var clientId1 = '612caa59-9649-491f-99b7-d9a941c4bd2e';
    var clientId2 = 'fca38c3d-dc17-4d1f-a143-1ca46aeda84b';
    var clientSecret1 = 'api-level_secret';

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
      function(done) {
        async.times(2, function(n, next) {
          request
            .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit2" should pass"',
      function(done) {
        async.times(3, function(n, next) {
          request
            .get('/v1/ratelimit2?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit2" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit2?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit3" should be 404"',
      function(done) {
        request
        .get('/v1/ratelimit3?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(404, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit4" should pass"',
      function(done) {
        async.times(2, function(n, next) {
          request
            .get('/v1/ratelimit4?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit4" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit4?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit5" should pass"',
      function(done) {
        async.times(3, function(n, next) {
          request
            .get('/v1/ratelimit5?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit5" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit5?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit6" should pass"',
      function(done) {
        async.times(2, function(n, next) {
          request
            .get('/v1/ratelimit6?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit6" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit6?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit7" should pass"',
      function(done) {
        async.times(3, function(n, next) {
          request
            .get('/v1/ratelimit7?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit7" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit7?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit8" should pass"',
      function(done) {
        async.times(10, function(n, next) {
          request
            .get('/v1/ratelimit8?client_id=' + clientId2)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit8" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit8?client_id=' + clientId2)
        .expect(429, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit9" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit9?client_id=' + clientId2)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit10" should pass"',
      function(done) {
        async.times(3, function(n, next) {
          request
            .get('/v1/ratelimit10?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
            .set('x-ibm-plan-id', 'apim:1.0.0:gold')
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit10" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit10?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .expect(429, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit11" should pass"',
      function(done) {
        async.times(2, function(n, next) {
          request
            .get('/v1/ratelimit11?client_id=' + clientId2)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit11" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit11?client_id=' + clientId2)
        .expect(429, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit11R" should pass"',
      function(done) {
        async.times(2, function(n, next) {
          request
            .get('/v1/ratelimit11R?client_id=' + clientId2)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit11R" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit11R?client_id=' + clientId2)
        .expect(429, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit12" should pass"',
      function(done) {
        async.times(11, function(n, next) {
          request
            .get('/v1/ratelimit12?client_id=' + clientId2)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit13" should pass"',
      function(done) {
        async.times(11, function(n, next) {
          request
            .get('/v1/ratelimit13?client_id=' + clientId2)
            .expect(200, next);
        }, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit14" should reject"',
      function(done) {
        request
          .get('/v1/ratelimit14?client_id=' + clientId2)
          .expect(429, done);
      });

    it('client_id=' + clientId2 + ' "/ratelimit14" should reject"',
      function(done) {
        request
        .get('/v1/ratelimit14?client_id=' + clientId2)
        .expect(429, done);
      });
  }

  tests('apim');

});
