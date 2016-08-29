// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var should = require('should'); //eslint-disable-line no-unused-vars
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('cross origin resource sharing policy', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/cors';
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect cors headers', function(done) {
    request
      .get('/cors/path-cors')
      .expect('Access-Control-Allow-Origin', '*')
      .expect('Access-Control-Allow-Headers', '')
      .expect('Access-Control-Expose-Headers',
              'APIm-Debug-Trans-Id, X-RateLimit-Limit, ' +
              'X-RateLimit-Remaining, X-RateLimit-Reset, ' +
              'X-Global-Transaction-ID')
      .expect('Access-Control-Allow-Methods', 'GET,OPTIONS')
      .expect('Access-Control-Allow-Credentials', 'false')
      .expect(200, done);
  });

  it('should expect cors origin headers', function(done) {
    request
      .get('/cors/path-cors')
      .set('Origin', 'myorigin')
      .expect('Access-Control-Allow-Origin', 'myorigin')
      .expect('Access-Control-Allow-Headers', '')
      .expect('Access-Control-Expose-Headers',
              'APIm-Debug-Trans-Id, X-RateLimit-Limit, ' +
              'X-RateLimit-Remaining, X-RateLimit-Reset, ' +
              'X-Global-Transaction-ID')
      .expect('Access-Control-Allow-Methods', 'GET,OPTIONS')
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect(200, done);
  });

  it('should expect cors req headers', function(done) {
    request
      .get('/cors/path-cors')
      .set('Access-Control-Request-Headers', 'myreqhdr')
      .expect('Access-Control-Allow-Origin', '*')
      .expect('Access-Control-Allow-Headers', 'myreqhdr')
      .expect('Access-Control-Expose-Headers',
              'APIm-Debug-Trans-Id, X-RateLimit-Limit, ' +
              'X-RateLimit-Remaining, X-RateLimit-Reset, ' +
              'X-Global-Transaction-ID')
      .expect('Access-Control-Allow-Methods', 'GET,OPTIONS')
      .expect('Access-Control-Allow-Credentials', 'false')
      .expect(200, done);
  });

  it('should expect cors headers for explicit options', function(done) {
    request
      .get('/cors/path-cors')
      .expect('Access-Control-Allow-Origin', '*')
      .expect('Access-Control-Allow-Headers', '')
      .expect('Access-Control-Expose-Headers',
              'APIm-Debug-Trans-Id, X-RateLimit-Limit, ' +
              'X-RateLimit-Remaining, X-RateLimit-Reset, ' +
              'X-Global-Transaction-ID')
      .expect('Access-Control-Allow-Methods', 'GET,OPTIONS')
      .expect('Access-Control-Allow-Credentials', 'false')
      .expect(200, done);
  });

  it('should expect cors default headers', function(done) {
    request
      .get('/cors-default/path-cors')
      .expect('Access-Control-Allow-Origin', '*')
      .expect('Access-Control-Allow-Headers', '')
      .expect('Access-Control-Expose-Headers',
              'APIm-Debug-Trans-Id, X-RateLimit-Limit, ' +
              'X-RateLimit-Remaining, X-RateLimit-Reset, ' +
              'X-Global-Transaction-ID')
      .expect('Access-Control-Allow-Methods', 'GET,OPTIONS')
      .expect('Access-Control-Allow-Credentials', 'false')
      .expect(200, done);
  });

  it('should not expect cors headers', function(done) {
    request
      .get('/cors-disabled/path-cors')
      .expect(200)
      .end(function(err, res) {
        if (err) {
          return done(err);
        }
        var acao = res.header['Access-Control-Allow-Origin'] !== undefined;
        var acah = res.header['Access-Control-Allow-Headers'] !== undefined;
        var aceh = res.header['Access-Control-Expose-Headers'] !== undefined;
        var acam = res.header['Access-Control-Allow-Methods'] !== undefined;
        var acac = res.header['Access-Control-Allow-Credentials'] !== undefined;
        acao.should.be.False();
        acah.should.be.False();
        aceh.should.be.False();
        acam.should.be.False();
        acac.should.be.False();
        done();
      });
  });
});

