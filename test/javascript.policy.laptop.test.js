// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var mg = require('../lib/microgw');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('javascript policy', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/javascript';
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
    resetLimiterCache();
    dsCleanupFile();
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('compile error', function(done) {
    request
      .get('/javascript/compileError')
      .expect(/^SyntaxError: /, done)
      .expect(/Unexpected identifier$/, done)
      .expect(200, done);
  });

  it('runtime error', function(done) {
    request
      .get('/javascript/runtimeError')
      .expect(/^TypeError: /, done)
      .expect(/Cannot read property/, done)
      .expect(200, done);
  });

  it('throw native to get a JavaScriptError', function(done) {
    request
      .get('/javascript/throwNative')
      .set('X-VALUE', 'foo')
      .expect(200, /JavaScriptError: foo/, done);
  });

  it('throw a custom error object', function(done) {
    request
      .get('/javascript/throwErrorObject')
      .set('X-VALUE', 'foo')
      .expect(200, /foo: this is a dummy message/, done);
  });

  it('throw and catch a custom error object', function(done) {
    request
      .get('/javascript/throwErrorObject')
      .set('X-VALUE', 'bar')
      .expect(200, /Catch the bar error!/, done);
  });

  it('no param resolving', function(done) {
    request
      .get('/javascript/no-param-resolving')
      .set('X-VALUE', 'foo')
      .expect(200, '$(request.headers.x-value): this is a dummy message', done);
  });
});

