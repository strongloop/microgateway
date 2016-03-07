'use strict';

var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var path = require('path');
var fs = require('fs');

describe('preflow and flow-engine integration', function() {

  var request;
  before(function(done) {
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function () { return echo.start(8889); })
      .then(function () {
        request = supertest('http://localhost:3000');
        console.log ('setup test1');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function (done) {
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
    echo.stop()
      .then(function () { return mg.stop(); })
      .then(done, done);
  });


  function tests(env) {
    var clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
    it('client_id=' + clientId1 + ' (query) should invoke API1 (apim-lookup)',
      function (done) {
        request
        .get('/v1/ascents?client_id=' + clientId1)
        .expect(200, '/api1', done);
      });

    var clientId2 = '612caa59-9649-491f-99b7-d9a941c4bd2e';
    it('client_id=' + clientId2 + ' (query) should invoke API2 (apim-lookup)',
      function (done) {
        request
        .get('/v1/forecasts?client_id=' + clientId2)
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId2 +
      ' (query) should invoke API2 (apim-lookup-defaultcat)',
      function (done) {
        request
        .get('/v1/forecasts?client_id=' + clientId2)
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad org (apim-lookup)',
      function (done) {
        request
        .get('/xyz/sb/v1/ascents?client_id=' + clientId1)
        .expect(404, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad catalog (apim-lookup)',
      function (done) {
        request
        .get('/xyz/v1/ascents?client_id=' + clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad base path (apim-lookup)',
      function (done) {
        request
        .get('/xyz/ascents?client_id=' + clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad path (apim-lookup)',
      function (done) {
        request
        .get('/v1/xyz?client_id=' + clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    var clientIdBad = '612caa59-9649-491f-99b7-d9a941c4bd2f';
    it('client_id=' + clientIdBad +
      ' (query) should not find api - bad clientId (apim-lookup)',
      function (done) {
        request
        .get('/v1/ascents?client_id=' + clientIdBad)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad clientId name (apim-lookup)',
      function (done) {
        request
        .get('/v1/ascents?client-id=' + clientIdBad)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    var clientSecret3a = 'api-level_secret';
    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (query) should invoke API3 (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a)
        .expect(200, '/api3', done);
      });

    var clientSecret3Bad = 'bad_secret';
    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3Bad + '(query) should not find api -' +
      ' bad secret (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3Bad)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 +
      ' (query) should not find api - missing secret (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?client_id=' + clientId2)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3a + '(query) should not find api -' +
      ' bad clientID valid secret (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?client_id=' + clientIdBad +
          '&client_secret=' + clientSecret3a)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + '(query) should not find api -' +
      ' bad secret name (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret_bad=' + clientSecret3a)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 + ' secret=' + clientSecret3a +
      ' (query) should invoke API3 with extra parm (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a +
          '&extra_parm=someValue')
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId1 + ' (header) should invoke API1 (apim-lookup)',
      function (done) {
        request
        .get('/v1/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(200, '/api1', done);
      });

    it('client_id=' + clientId2 + ' (header) should invoke API2 (apim-lookup)',
      function (done) {
        request
        .get('/v1/forecasts')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId2 +
      ' (header) should invoke API2 (apim-lookup-defaultcat)',
      function (done) {
        request
        .get('/v1/forecasts')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad org (apim-lookup)',
      function (done) {
        request
        .get('/xyz/sb/v1/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad catalog (apim-lookup)',
      function (done) {
        request
        .get('/apim/xyz/v1/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientIdBad +
      ' (header) should not find api - bad clientId (apim-lookup)',
      function (done) {
        request
        .get('/v1/ascents')
        .set('X-IBM-Client-Id', clientIdBad)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad base path (apim-lookup)',
      function (done) {
        request
        .get('/xyz/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad path (apim-lookup)',
      function (done) {
        request
        .get('/v1/xyz')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad clientID name (apim-lookup)',
      function (done) {
        request
        .get('/v1/ascents')
        .set('X-IBM-Client-Id-bad', clientId1)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (header) should invoke API3 (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret', clientSecret3a)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3Bad + '(header) should not find api -' +
      ' bad secret (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret', clientSecret3Bad)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 +
      ' (header) should not find api - missing secret (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3a + '(header) should not find api -' +
      ' bad clientID valid secret (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes?')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientIdBad)
        .set('X-IBM-Client-Secret', clientSecret3a)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + '(header) should not find api -' +
      ' bad secret name (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret-Bad', clientSecret3a)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientId2 + ' secret=' + clientSecret3a +
      ' (header) should invoke API3 with extra parm (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret', clientSecret3a)
        .set('extra_parm', 'someValue')
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (header) should invoke API3 -' +
      ' key only (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test1')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (query) should fail -' +
      ' no query at operation (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test1?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3Bad + ' (header) should invoke API3 -' +
      ' no requirements (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test2')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientIdBad)
        .set('X-IBM-Client-Secret', clientSecret3Bad)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3Bad + ' (header) should invoke API3 -' +
      ' bad names/values no requirements (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test2')
        .set('x-ibm-plan-id-bad', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id-bad', clientId2)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' (query) should invoke API3 - last req (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test3?client_id=' + clientId2)
        .expect(200, '/api3', done);
      });

    it('client_secret=' + clientSecret3a +
      ' (header) should invoke API3 - first req (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test3')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Secret', clientSecret3a)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' (header) should not find api - missing req (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test3')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(401, done);
      });

    it('client_secret=' + clientSecret3a +
      ' (header) should invoke API3 - first scheme (apim-lookup)',
      function (done) {
        request
        .get('/v1/routes/test3')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(401, {name: 'PreFlowError', message: 'unable to process the request'}, done);
      });

    /*
     it('should execute invoke-api POST', function(done) {
     request
     .post('/apim/test')
     .field('client_id', '123098456765')
     .send('hello')
     .expect(200, 'hello', done);
     });
     */
  }

  tests('apim');

});

