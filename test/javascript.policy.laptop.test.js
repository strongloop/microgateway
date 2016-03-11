'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var should = require('should');

describe('throw policy', function() {

  var request;
  before(function(done){
    process.env.CONFIG_DIR = __dirname + '/definitions/javascript';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('compile error', function(done) {
    request
      .get('/javascript/compileError')
      .expect(200, /SyntaxError: Unexpected identifier/, done);
  });

  it('runtime error', function(done) {
    request
      .get('/javascript/runtimeError')
      .expect(200, /TypeError: Cannot read property 'price'/, done);
  });

  it('throw native to get a JavaScriptError', function(done) {
    request
      .get('/javascript/throwNative')
      .set('X-VALUE', 'foo')
      .expect(200, /JavaScriptError: foo/, done);
  });

  it('throw a custom error object', function(done) {
    request
      .get('/javascript/throwErrorObject')
      .set('X-VALUE', 'foo')
      .expect(200, /foo: this is a dummy message/, done);
  });

});

