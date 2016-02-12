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
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
    mg.stop()
      .then(() => ldap.stop())
      .then(() => echo.stop())
      .then(done, done)
      .catch(done);
  });

  let clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
  it(`client_id=${clientId1} should pass with "root"/"Hunter2"`, function(done) {
    request
      .post('/v1/ascents?client_id=' +  clientId1)
      .auth('root', 'Hunter2')
      .send({date: 'today', route: '66'})
      .expect(200, '{"date":"today","route":"66"}', done);
  });

  it(`client_id=${clientId1} should fail`, function(done) {
    request
    .post('/v1/ascents?client_id=' +  clientId1)
    .auth('root', 'badpass')
    .send({date: 'today', route: '66'})
    .expect(401, done);
  });

  it(`client_id=${clientId1} should fail with http and "root"/"Hunter3"`, function(done) {
    request
      .put('/v1/ascents?client_id=' +  clientId1)
      .auth('root', 'Hunter3')
      .send({date: 'today', route: '66'})
      .expect(401, done);
  });

  it(`client_id=${clientId1} should pass with http and "root"/"Hunter2"`, function(done) {
    request
      .put('/v1/ascents?client_id=' +  clientId1)
      .auth('root', 'Hunter2')
      .send({date: 'today', route: '66'})
      .expect(200, '{"date":"today","route":"66"}', done);
  });

});
