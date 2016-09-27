// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');

describe('general laptop', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/yaml';
    process.env.NODE_ENV = 'production';
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
