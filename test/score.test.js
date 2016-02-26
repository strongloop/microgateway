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
    var clientId2 = '612caa59-9649-491f-99b7-d9a941c4bd2e';
    var clientSecret3a = 'api-level_secret';
    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' "/routes/foo/bar" should not -' +
      ' match "/routes/{id}"',
      function (done) {
        request
        .get('/v1/routes/foo/bar?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a)
        .expect(404, done);
      });
  }

  tests('apim');

});
