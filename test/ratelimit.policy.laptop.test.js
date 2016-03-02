'use strict';

let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let mg = require('../lib/microgw');
let should = require('should');
let os = require('os');
let copy = require('../utils/copy.js')

describe('ratelimit basic policy', function() {

  let request;
  before((done) => {
    copy.copyRecursive(__dirname + '/definitions/ratelimit', os.tmpdir()+ '/ratelimit');
    process.env.CONFIG_DIR = os.tmpdir()+ '/ratelimit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(() => {
        return echo.start(8889);
      })
      .then(() => {
        request = supertest('http://localhost:3000');
      })
      .then(done)
      .catch((err) => {
        console.error(err);
        done(err);
      });
  });

  after((done) => {
    mg.stop()
      .then(() => echo.stop())
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    copy.deleteRecursive(os.tmpdir()+ '/ratelimit');
    delete process.env.NODE_ENV;
  });

  it('should expect ratelimit header', function(done) {
    request
      .get('/ratelimit/ratelimit')
      .expect(200, done);
  });
});

