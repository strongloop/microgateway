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

describe('set-variable policy', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/set-variable';
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

  it('should set a simple string to a variable', function(done) {
    request
      .post('/set-variable/set-variable')
      .set('set-variable-case', 'set')
      .expect('X-Test-Set-Variable', 'value1')
      .expect(200, done);
  });

  it('should able to append on existing context variable', function(done) {
    request
      .post('/set-variable/set-variable')
      .set('set-variable-case', 'set-and-add')
      .expect('X-Test-Set-Variable', 'value1, value2')
      .expect(200, done);
  });

  it('should able to clear existing context variable', function(done) {
    request
      .post('/set-variable/set-variable')
      .set('set-variable-case', 'clear')
      .set('to-be-deleted', 'test-value')
      .expect(function(res) {
        if (res.headers['to-be-deleted']) {
          return 'context variable not deleted';
        }
      })
      .expect(200, done);
  });

  it('should able to set custom status code', function(done) {
    request
      .post('/set-variable/set-variable')
      .set('set-variable-case', 'set')
      .set('custom-status-code', 666)
      .expect(666, done);
  });

  it('should able to set custom status reason', function(done) {
    request
      .post('/set-variable/set-variable')
      .set('set-variable-case', 'set')
      .set('custom-status-reason', 'Foobar')
      .expect(function(res, done) {
        if (res.res.statusMessage !== 'Foobar') {
          throw new Error("status reason should be 'Foobar'");
        }
      })
      .expect(200, done);
  });

  it('should able to set custom status code and reason', function(done) {
    request
      .post('/set-variable/set-variable')
      .set('set-variable-case', 'set')
      .set('custom-status-code', '303')
      .set('custom-status-reason', 'Foobar')
      .expect(function(res, done) {
        if (res.res.statusMessage !== 'Foobar') {
          throw new Error("status reason should be 'Foobar'");
        }
      })
      .expect(303, done);
  });

});

