'use strict';

let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let ldap = require('./support/ldap-server');
let mg = require('../lib/microgw');

describe('basic auth policy', function() {

  let request;
  before((done) => {
    mg.start(3000)
      .then(ldap.start(1389))
      .then(echo.start(8889))
      .then(() => {
        request = supertest('http://localhost:3000');
        console.log ('setup test1');
        done();
      }).catch((err) => {
        console.error(err);
      });
  });

  after((done) => {
    echo.stop()
      .then(ldap.stop())
      .then(mg.stop())
      .then(done, done);
  });

  var clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
  it('test basic auth',
     function(done) {
       console.log ('send request');
       request
         .get('/apim/sb/v1/ascents_basic_auth?client_id=' +  clientId1)
         .expect(200, '/api1', done);
     });

});
