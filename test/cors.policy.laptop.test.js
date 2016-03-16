'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var should = require('should');

describe('cors policy', function() {

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

  it('should expect cors headers', function(done) {
    request
      .get('/cors-policy/cors1')
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect('Access-Control-Allow-Headers', 'FOO, BAR')
      .expect('Access-Control-Allow-Methods', 'GET, POST')
      .expect('Access-Control-Allow-Origin', 'http://foo.example.com')
      .expect('Access-Control-Expose-Headers', 'X-Foo-Header, X-Bar-Header')
      .expect('Access-Control-Max-Age', 3600)
      .expect(200, done);
  });

  it('should not expect cors header', function(done) {
    request
      .get('/cors-policy/cors2')
      .expect(200)
      .end(function(err, res) {
        if (err) return done(err);
        var cors = res.header['Access-Control-Allow-Origin'] !== undefined;
        cors.should.be.False();
        cors = res.header['Access-Control-Allow-Headers'] !== undefined;
        cors.should.be.False();
        cors = res.header['Access-Control-Allow-Methods'] !== undefined;
        cors.should.be.False();
        cors = res.header['Access-Control-Expose-Headers'] !== undefined;
        cors.should.be.False();
        cors = res.header['Access-Control-Max-Age'] !== undefined;
        cors.should.be.False();
        cors = res.header['Access-Control-Allow-Credentials'] !== undefined;
        cors.should.be.False();
        done();
      });
  });
});

