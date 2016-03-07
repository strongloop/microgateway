'use strict';

var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var path = require('path');
var fs = require('fs');

describe('urlrewrite', function() {

  var request;
  before(function(done) {
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';
    process.env.WLPN_APP_ROUTE = 'http:///apim/sb'
    mg.start(3000)
      .then(function() {echo.start(8889);})
      .then(function() {
        request = supertest('http://localhost:3000');
        console.log ('setup test1');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
    echo.stop()
      .then(function() {mg.stop();})
      .then(done, done);
  });


  function tests(env) {
    var clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
    it('client_id=' + clientId1 + ' (query) should invoke API1 (apim-lookup)',
      function (done) {
        request
        .get('/apim/sb/v1/ascents?client_id=' + clientId1)
        .expect(200, '/api1', done);
      });

  }

  tests('apim');

});

