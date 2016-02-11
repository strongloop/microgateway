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
    console.log('Starting micro-gateway');
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
        console.log('Starting LDAP server');
        return ldap.start(1389);
      })
      .then(() => {
        console.log('Starting Echo server');
        return echo.start(8889);
      })
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
    echo.stop()
      .then(ldap.stop())
      .then(mg.stop())
      .then(done, done)
      .catch(done);
  });

  let clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
  it(`client_id=${clientId1} should pass with "root"/"Hunter2"`, function(done) {
    console.log ('send request');
    request
      .post('/apim/sb/v1/ascents?client_id=' +  clientId1)
      .auth('root', 'Hunter2')
      .send({date: 'today', route: '66'})
      .expect(200, '{"date":"today","route":"66"}', done);
  });

  it(`client_id=${clientId1} should fail`, function(done) {
    console.log ('send request');
    request
    .post('/apim/sb/v1/ascents?client_id=' +  clientId1)
    .auth('root', 'badpass')
    .send({date: 'today', route: '66'})
    .expect(401, done);
  });

});
