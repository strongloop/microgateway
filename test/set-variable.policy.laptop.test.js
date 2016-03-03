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
    mg.stop()
      .then(() => echo.stop())
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
      .expect('to-be-deleted', '')
      .expect(200, done);
  });

});

