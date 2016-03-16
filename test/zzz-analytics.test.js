'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var apimServer = require('./support/mock-apim-server2/apim-server');
var should = require('should');
var Promise = require('bluebird');

describe('analytics', function() {

  var request;
  var mg;
  before(function (done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/set-variable';
    process.env.NODE_ENV = 'production';
    process.env.APIMMANAGER = 'localhost';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    delete require.cache[require.resolve('../lib/microgw')];
    mg = require('../lib/microgw');
    mg.start(3000)
    .then(function() {
      return echo.start(8889);
    })
    .then(function() {
        return apimServer.start('localhost', 9443);
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

  after(function (done) {
    return mg.stop()
      .then(function() {
        return new Promise(function(resolve, reject) {
          setTimeout(function() {
            resolve();
          }, 5000);
        });
      })
      .then(function() { return echo.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() {
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
      .expect(function(res) {
        if (res.headers['to-be-deleted']) return 'context variable not deleted';
      })
      .expect(200, done);
  });

});

