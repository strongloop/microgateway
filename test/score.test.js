// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('matching score test', function() {

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
        console.log('setup test1');
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
    var clientSecret1 = 'api-level_secret';
    var clientSecret2 = 'bad_secret';
    it('client_id=' + clientId1 +
      ' secret=' + clientSecret1 + ' "/routes/foo/bar" should not -' +
      ' match "/routes/{id}"',
      function(done) {
        request
        .get('/v1/routes/foo/bar?client_id=' + clientId1 +
          '&client_secret=' + clientSecret1)
        .expect(404, done);
      });

    it('client_id=' + clientId1 +
      ' secret=' + clientSecret1 + ' "/test4/id/exists" not authorized -' +
      ' for "/test4/id/{exists}"',
      function(done) {
        request
        .get('/v1/test4/id/exists?client_id=' + clientId1 +
          '&client_secret=' + clientSecret1)
        .expect(200, done);
      });

    it('client_id=' + clientId1 +
      ' secret=' + clientSecret2 + ' "/test4/id/exists" not authorized -' +
      ' for "/test4/id/{exists}"',
      function(done) {
        request
        .get('/v1/test4/id/exists?client_id=' + clientId1 +
          '&client_secret=' + clientSecret2)
        .expect(401, done);
      });

    it('client_id=' + clientId1 +
      ' secret=' + clientSecret2 + ' "/test4//exists" does not match -' +
      ' for "/test4/id/{exists}"',
      function(done) {
        request
        .get('/v1/test4//exists?client_id=' + clientId1 +
          '&client_secret=' + clientSecret2)
        .expect(404, done);
      });

    it('client_id=' + clientId1 +
      ' secret=' + clientSecret1 + ' "/test4/id/foo" does not match -' +
      ' for "/test4/id/{exists}"',
      function(done) {
        request
        .get('/v1/test4/foo/exists?client_id=' + clientId1 +
          '&client_secret=' + clientSecret1)
        .expect(200, done);
      });
  }

  tests('apim');

});
