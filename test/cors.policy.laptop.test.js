'use strict';

let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let mg = require('../lib/microgw');
let should = require('should');
let os = require('os');
let copy = require('../utils/copy.js');

describe('cors policy', function() {

  let request;
  before((done) => {
    copy.copyRecursive(__dirname + '/definitions/cors', os.tmpdir()+ '/cors');
    process.env.CONFIG_DIR = os.tmpdir() + '/cors';
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
    copy.deleteRecursive(os.tmpdir()+ '/cors');
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

