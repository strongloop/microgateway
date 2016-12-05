// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var assert = require('assert');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var fs = require('fs');

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

describe('Monitor modification on yaml files', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/yaml';
    process.env.NODE_ENV = 'production';
    fs.createReadStream(__dirname + '/definitions/yaml_monitor/yaml_1.0.0.yaml.orig')
      .pipe(fs.createWriteStream(__dirname + '/definitions/yaml/yaml_1.0.0.yaml'));

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

  it('test file monitor before change', function(done) {
    var payload = 'hello world';
    request
      .put('/laptop/yaml/monitor')
      .type('text/plain')
      .send(payload)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');
        assert.deepEqual(res.text, 'hello');
        done();
      });
  });

  it('test file monitor change yaml', function(done) {
    fs.createReadStream(__dirname + '/definitions/yaml_monitor/yaml_1.0.0.yaml.mod')
       .pipe(fs.createWriteStream(__dirname + '/definitions/yaml/yaml_1.0.0.yaml'));
    var payload = 'reload data';
    request
      .put('/laptop/yaml/monitor')
      .type('text/plain')
      .send(payload)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');
        done();
      });
  });

  it('test file monitor after change', function(done) {
    setTimeout(function() {
      var payload = 'hello world';
      request
        .put('/laptop/yaml/monitor')
        .type('text/plain')
        .send(payload)
        .end(function(err, res) {
          assert(!err, 'Unexpected error with context unit tests');
          assert.deepEqual(res.text, 'hello world');
          done();
        });
    }, 10000);
  });
});
