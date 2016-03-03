'use strict';

let _ = require('lodash');
let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let ldap = require('./support/ldap-server');
let mg = require('../lib/microgw');
let dsc = require('../datastore/client');
let should = require('should');
let apimServer = require('./support/mock-apim-server/apim-server');

function cleanup () {
  const rmfile = fpath => new Promise((resolve, reject) => {
    console.log(`Removing file ${fpath}`);
    fs.unlink(fpath, err => {
      if (err) {
        console.error(`Error removing ${fpath}`);
        reject(err);
      }
      else
        resolve();
    })
  });

  const readdir = dir => new Promise((resolve, reject) => {
    fs.readdir(ssdir, (err, files) => {
      if (err) {
        console.error(`Error while reading ${ssdir}`);
        reject(err);
      }
      else
        resolve(files);
    });
  });

  let ssdir;

  return dsc.getCurrentSnapshot()
    .then(id => {
      ssdir = path.resolve(__dirname, '../config', id);
      return readdir(ssdir);
    })
    .then(files => new Promise((resolve) => {
      console.log(`Removing ${ssdir}`);
      let p = Promise.all(_.map(files, f => rmfile(path.resolve(ssdir, f))));
      p = p.then(() => {
        fs.rmdir(ssdir, err => {
          if (err)
            console.error(`Error removing ${fpath}`);
          resolve(p);
        });
      })
    }))
    .catch(err => {
      console.error('cleanup() failed due to error', err);
    });
}

describe('basic auth policy', function() {

  let request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/basic';
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8081;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';
    apimServer.start('127.0.0.1', 8081)
      .then(() => mg.start(3000))
      .then(() => {
        return ldap.start(1389, 1636);
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
    cleanup()
      .then(() => mg.stop())
      .then(() => ldap.stop())
      .then(() => echo.stop())
      .then(() => apimServer.stop())
      .then(() => {
        delete process.env.CONFIG_DIR;
        delete process.env.DATASTORE_PORT;
        delete process.env.APIMANAGER_PORT;
        delete process.env.APIMANAGER;
        delete process.env.NODE_ENV;
      })
      .then(done, done)
      .catch(done);
  });

  describe('Basic Auth with LDAP', function () {

    it('should fail due to missing LDAP registry', function (done) {
      request
      .post('/basic/path-1')
      .auth('root', 'Hunter2')
      .expect(401, done);
    });

    describe('SearchDN', function () {
      it('should pass with root:Hunter2', function (done) {
        request
        .get('/basic/path-1')
        .auth('root', 'Hunter2')
        .expect(200, done);
      });

      it('should fail with root:badpass', function (done) {
        request
        .get('/basic/path-1')
        .auth('root', 'badpass')
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });
    });

    describe('ComposeDN', function () {
      it('should pass composeDN with jsmith:foobar', function(done) {
        request
        .get('/basic/path-3')
        .auth('jsmith', 'foobar')
        .expect(200, done);
      });

      it('should fail composeDN with jsmith:wrongpass', function(done) {
        request
        .get('/basic/path-3')
        .auth('jsmith', 'wrongpass')
        .expect(401, done);
      });
    });


    describe('With TLS', function () {
      it('should pass with root:Hunter2 (tls)', function (done) {
        request
        .put('/basic/path-1')
        .auth('root', 'Hunter2')
        .expect(200, done);
      });
    });

  });

  describe('Basic Auth with HTTP', function () {
    it('should pass using http with root:Hunter2', function (done) {
      request
      .get('/basic/path-2')
      .auth('root', 'Hunter2')
      .expect(200, done);
    });

    it('should fail using http with root:badpass', function (done) {
      request
      .get('/basic/path-2')
      .auth('root', 'badpass')
      .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
    });
  });

});
