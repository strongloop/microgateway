'use strict';

let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let mg = require('../lib/microgw');
var path = require('path');
var fs = require('fs');

describe('matching score test', function() {

  let request;
  before((done) => {
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(() => echo.start(8889))
      .then(() => {
        request = supertest('http://localhost:3000');
        console.log ('setup test1');
      })
      .then(done)
      .catch((err) => {
        console.error(err);
        done(err);
      });
  });

  after((done) => {
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
    echo.stop()
      .then(() => mg.stop())
      .then(done, done);
  });

  function tests(env) {
    var clientId1 = '612caa59-9649-491f-99b7-d9a941c4bd2e';
    var clientSecret1 = 'api-level_secret';
    var clientSecret2 = 'bad_secret';
    
    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
      function (done) {
        request
        .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(200, done);
      });
    
    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
      function (done) {
        request
        .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(200, done);
      });
    
    // it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
    //   function (done) {
    //     request
    //     .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
    //     .expect(200, done);
    //   });
    // 
    // it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
    //   function (done) {
    //     request
    //     .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
    //     .expect(200, done);
    //   });
    // 
    // it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
    //   function (done) {
    //     request
    //     .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
    //     .expect(200, done);
    //   });
    // 
    // it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
    //   function (done) {
    //     request
    //     .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
    //     .expect(200, done);
    //   });
    // 
    // it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
    //   function (done) {
    //     request
    //     .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
    //     .expect(200, done);
    //   });
    // 
    // it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should pass"',
    //   function (done) {
    //     request
    //     .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
    //     .expect(200, done);
    //   });
      
    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit1" should reject"',
      function (done) {
        request
        .get('/v1/ratelimit1?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit2" should pass"',
      function (done) {
        request
        .get('/v1/ratelimit2?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(200, done);
      });

    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit2" should pass"',
      function (done) {
        request
        .get('/v1/ratelimit2?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(200, done);
      });
    
    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit2" should pass"',
      function (done) {
        request
        .get('/v1/ratelimit2?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(200, done);
      });
    
    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit2" should reject"',
      function (done) {
        request
        .get('/v1/ratelimit2?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(429, done);
      });
    
    it('client_id=' + clientId1 + ' secret=' + clientSecret1 + ' "/ratelimit3" should be 404"',
      function (done) {
        request
        .get('/v1/ratelimit3?client_id=' + clientId1 + '&client_secret=' + clientSecret1)
        .expect(404, done);
      });
  }

  tests('apim');

});
