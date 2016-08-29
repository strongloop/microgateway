// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('general laptop', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/yaml';
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
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('no x-ibm-name', function(done) {
    var payload = 'hello world';
    request
      .post('/laptop/echo')
      .send(payload)
      .expect(200, done);
  });

});
