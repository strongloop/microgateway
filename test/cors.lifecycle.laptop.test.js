'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var should = require('should');

describe('cross origin resource sharing policy', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/cors';
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
        console.error(err);
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

