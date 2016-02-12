'use strict';

let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let ldap = require('./support/ldap-server');
let mg = require('../lib/microgw');
let should = require('should');

describe('basic auth policy', function() {

  let request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions';
    const writeconf = () => (new Promise((resolve, reject) => {
      const confpath = path.resolve(__dirname, '../config/apim.config');
      fs.writeFile(confpath, '{"APIMANAGER": "127.0.0.1"}', 'utf8', (err) => {
        if (err) reject(err);
        else resolve();
      });
    }));
    writeconf()
      .then(() => mg.start(3000))
      .then(() => {
        return ldap.start(1389);
      })
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
      .then(() => ldap.stop())
      .then(() => echo.stop())
      .then(done, done)
      .catch(done);
  });

  it('should pass with root:Hunter2', function(done) {
    request
      .get('/basic/path-1')
      .auth('root', 'Hunter2')
      .expect(200, done);
  });

  it('should fail with root:badpass', function(done) {
    request
      .get('/basic/path-1')
      .auth('root', 'badpass')
      .expect(401, done);
  });

  it('should pass using http with root:Hunter2', function(done) {
    request
      .get('/basic/path-2')
      .auth('root', 'Hunter2')
      .expect(200, done);
  });

  it('should fail using http with root:badpass', function(done) {
    request
      .get('/basic/path-2')
      .auth('root', 'badpass')
      .expect(401, done);
  });

});
