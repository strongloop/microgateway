// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var ldap = require('./support/ldap-server');
var mg = require('../lib/microgw');
var apimServer = require('./support/mock-apim-server/apim-server');
var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('basic auth policy', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/basic';
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8081;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
    apimServer.start('127.0.0.1', 8081)
      .then(function() { return mg.start(3000); })
      .then(function() {
        return ldap.start(1389, 1636);
      })
      .then(function() {
        return echo.start(8889);
      })
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
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return ldap.stop(); })
      .then(function() { return echo.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() {
        delete process.env.CONFIG_DIR;
        delete process.env.DATASTORE_PORT;
        delete process.env.APIMANAGER_PORT;
        delete process.env.APIMANAGER;
        delete process.env.NODE_ENV;
      })
      .then(done, done)
      .catch(done);
  });

  describe('Basic Auth with LDAP', function() {

    it('should fail due to missing LDAP registry', function(done) {
      request
      .post('/basic/path-1')
      .auth('root', 'Hunter2')
      .expect(401, done);
    });

    describe('SearchDN', function() {
      it('should pass with root:Hunter2', function(done) {
        request
        .get('/basic/path-1')
        .auth('root', 'Hunter2')
        .expect(200, done);
      });

      it('should fail with root:badpass', function(done) {
        request
        .get('/basic/path-1')
        .auth('root', 'badpass')
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });
    });

    describe('ComposeDN', function() {
      it('should pass composeDN with jsmith:foobar', function(done) {
        request
        .get('/basic/path-3')
        .auth('jsmith', 'foobar')
        .expect(200, done);
      });

      it('should fail composeDN with jsmith:wrongpass', function(done) {
        request
        .get('/basic/path-3')
        .auth('jsmith', 'wrongpass')
        .expect(401, done);
      });
    });

    describe('ComposeUPN', function() {
      it.skip('should pass with user1:c@pstone123', function(done) {
        request
        .get('/basic/compose-upn')
        .auth('user1', 'c@pstone123')
        .expect(200, done);
      });

      it.skip('should fail with user1:capstone123', function(done) {
        request
        .get('/basic/compose-upn')
        .auth('user1', 'capstone123')
        .expect(401, done);
      });

    });

    describe('With TLS', function() {
      it('should pass with root:Hunter2 (tls)', function(done) {
        request
        .put('/basic/path-1')
        .auth('root', 'Hunter2')
        .expect(200, done);
      });
    });

    //describe('With long reply time', function() {
    //  it('should timeout', function(done) {
    //    this.timeout(15000);
    //    request
    //    .get('/basic/path-3')
    //    .auth('slow', 'slowpass')
    //    .expect(401, done);
    //  });
    //});

  });

  describe('Basic Auth with HTTP', function() {

    it('should pass using http with root:Hunter2', function(done) {
      request
      .get('/basic/path-2')
      .auth('root', 'Hunter2')
      .expect(200, done);
    });

    it('should fail using http with root:badpass', function(done) {
      request
      .get('/basic/path-2')
      .auth('root', 'badpass')
      .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
    });

    //it('should timeout', function(done) {
    //  this.timeout(150000);
    //  request
    //  .get('/basic/slow-basic-http')
    //  .auth('root', 'Hunter2')
    //  .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
    //});


  });

  describe('Basic Auth with HTTPS', function() {
    it('should pass using http with root:Hunter2', function(done) {
      request
      .get('/basic/basic-https')
      .auth('root', 'Hunter2')
      .expect(200, done);
    });

    it('should fail using http with root:badpass', function(done) {
      request
      .get('/basic/basic-https')
      .auth('root', 'badpass')
      .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
    });

    //it('should timeout', function(done) {
    //  this.timeout(15000);
    //  request
    //  .get('/basic/slow-basic-https')
    //  .auth('root', 'Hunter2')
    //  .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
    //});
  });
});
