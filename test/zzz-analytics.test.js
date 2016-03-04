'use strict';

let fs = require('fs');
let path = require('path');
let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let apimServer = require('./support/mock-apim-server2/apim-server');
let should = require('should');

describe('analytics', function() {

  let request;
  let mg;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/set-variable';
    process.env.NODE_ENV = 'production';
    process.env.APIMMANAGER = 'localhost';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    delete require.cache[require.resolve('../lib/microgw')];
    mg = require('../lib/microgw');
    mg.start(3000)
    .then(() => {
      return echo.start(8889);
    })
    .then( () => {
        return apimServer.start('localhost', 9443);
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
      .then(() => {
        return new Promise( (resolve, reject) => {
          setTimeout( () => {
            resolve();
          }, 5000);
        });
      })
      .then(() => echo.stop())
      .then(() => apimServer.stop())
      .then(() => {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        delete process.env.CONFIG_DIR;
        delete process.env.NODE_ENV;
        delete process.env.APIMMANAGER;
      })
      .then(done, done)
      .catch(done);
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

