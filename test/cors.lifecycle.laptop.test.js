'use strict';

let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let mg = require('../lib/microgw');
let should = require('should');

describe('cross origin resource sharing policy', function() {

  let request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/cors';
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

  it('should expect cors header', function(done) {
    request
      .get('/cors/path-cors')
      .expect('Access-Control-Allow-Origin', '*')
      .expect(200, done);
  });

  it('should not expect cors header', function(done) {
    request
      .get('/cors-disabled/path-cors')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        var cors = res.header['Access-Control-Allow-Origin'] !== undefined;
        cors.should.be.False();
        done();
      });
  });
});

