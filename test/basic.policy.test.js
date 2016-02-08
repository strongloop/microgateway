'use strict';

let express = require('express');
let supertest = require('supertest');
let echo = require('./support/echo-server');
let ldap = require('./support/ldap-server');
let mg = require('../lib/microgw');
let should = require('should');

describe('basic auth policy', function() {

  let request;
  before((done) => {
    mg.start(3000)
      .then(() => ldap.start(1389))
      .then(() => echo.start(8889))
      .then(() => {
        request = supertest('http://localhost:3000');
        console.log ('setup test1');
        done();
      }).catch((err) => {
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

  var clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
  it('test basic auth',
     function(done) {
       console.log ('send request');
       request
         .post('/apim/sb/v1/ascents?client_id=' +  clientId1)
         .send({date: 'today', route: '66'})
         .expect(200, '{"date":"today","route":"66"}', done);
     });
});
