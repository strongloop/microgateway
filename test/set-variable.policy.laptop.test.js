'use strict';

let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let mg = require('../lib/microgw');
let should = require('should');

describe('set-variable policy', function() {

  let request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/set-variable';
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
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    mg.stop()
      .then(() => echo.stop())
      .then(done, done)
      .catch(done);
  });

  it('should set a simple string to a variable', function(done) {
    request
      .get('/set-variable/set-variable')
      .expect(200, done);
  });
});

