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
let date = new Date();
let randomInsert = date.getTime().toString();
let destinationDir = path.join(os.tmpdir(), randomInsert + 'cors');

describe('cross origin resource sharing policy', function() {

  let request;
  before((done) => {
    copy.copyRecursive(__dirname + '/definitions/cors', destinationDir);
    process.env.CONFIG_DIR = destinationDir;
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
    copy.deleteRecursive(destinationDir);
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

