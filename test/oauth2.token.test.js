// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var assert = require('assert');
var supertest = require('supertest');
var microgw = require('../lib/microgw');
var authServer = require('./support/auth-server');
var apimServer = require('./support/mock-apim-server/apim-server');


describe('oauth2 token API', function() {

  var request, datastoreRequest;
  before(function(done)  {
    //Use production instead of CONFIG_DIR: reading from apim instead of laptop
    process.env.NODE_ENV = 'production';

    //The apim server and datastore
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;

    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            __dirname + '/definitions/oauth2')
        .then(function() { return microgw.start(3000); })
        .then(function() { return authServer.start(8889); })
        .then(function() {
            request = supertest('https://localhost:3000');
            datastoreRequest = supertest('http://localhost:5000');
        })
        .then(done)
        .catch(function(err) {
            console.error(err);
            done(err);
            });
  });

  after(function(done) {
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_PORT;
    delete process.env.DATASTORE_PORT;

    apimServer.stop()
      .then(function() { return microgw.stop(); })
      .then(function() { return authServer.stop(); })
      .then(done, done)
      .catch(done);
  });

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  it('api', function(done) {
    request.get('/stock/quote?symbol=IBM')
      .set('X-IBM-Client-Id', '6a76c27f-f3f0-47dd-8e58-50924e4a1bab')
      .set('X-IBM-Client-Secret', 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU')
      .expect(200, /{ "IBM": 123 }/)
      .end(function(err, res) {
        done(err);
      });
  });


  describe('token endpoint - client credential', function() {
    it('basic', function(done) {
      var data = {
          'grant_type': 'client_credentials',
          'client_id': '6a76c27f-f3f0-47dd-8e58-50924e4a1bab',
          'client_secret': 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU'
      };
      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.expires_in, 120);
        })
        .end(function(err, res) {
          done(err);
        });
    });

  });

  describe('token endpoint - password', function() {
    it('basic', function(done) {
      var data = {
          'grant_type': 'password',
          'client_id': '6a76c27f-f3f0-47dd-8e58-50924e4a1bab',
          'client_secret': 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU',
          'username': 'root',
          'password': 'Hunter2'
      };
      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.expires_in, 120);
        })
        .end(function(err, res) {
          done(err);
        });
    });

  });

});
