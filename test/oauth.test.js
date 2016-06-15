// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
Promise.longStackTraces();
var fs = require('fs');
var path = require('path');
var mg = require('../lib/microgw');
var supertest = require('supertest');
var _ = require('lodash');
var jws = require('jws');
var assert = require('assert');
var debug  = require('debug')('tests:oauth');
var apimServer = require('./support/mock-apim-server/apim-server');
var echo = require('./support/echo-server');

//var configDir = path.join(__dirname, 'definitions', 'oauth');
var configDir = path.join(__dirname, 'definitions', 'oauth2');

var request, httprequest, NODE_TLS_REJECT_UNAUTHORIZED;

function dsCleanup(port) {
  // clean up the directory
  return new Promise(function(resolve, reject) {
    var expect = {snapshot : {}};
    var datastoreRequest = supertest('http://localhost:' + port);
    datastoreRequest
      .get('/api/snapshots')
      .end(function (err, res) {
        var snapshotID = res.body[0].id;
        datastoreRequest
          .get('/api/snapshots/release?id=' + snapshotID)
          .end(function(err, res) {
            try {
              assert(_.isEqual(expect, res.body));
              resolve();
            } catch (error) {
              reject(error);
            }
          });
      });
  });
}

describe.skip('oauth testing', function() {
  before(function(done) {
    process.env.CONFIG_DIR = configDir;
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        request = supertest(mg.app);
      })
      .then(done)
      .catch(function(err) {
        debug(err);
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

  it('should pass requests through OAuth2 resource server - /resource-test/res1', function (done) {
    var token = {
      header: { alg: 'HS256' },
      payload: {
        jti: 'koc1t3OgERRY6x9oHxIUesNfiUXTboa65BefHrUHjOQ',
        aud: '6a76c27f-f3f0-47dd-8e58-50924e4a1bab',
        iat: '2016-06-02T08:07:57.392Z',
        exp: '2100-01-01T00:00:00.000Z',
        scope: ['/']
      },
      secret: 'foobar'
    };
    request
      .get('/resource-test/res1')
      .set('Authorization', 'Bearer ' + jws.sign(token))
      .expect(200, done);
  });

  //it('should pass requests through OAuth2 resource server - /resource-test/res3', function (done) {
  //  request
  //    .get('/resource-test/res3')
  //    .expect(200, done);
  //});

});

describe('oauth testing onprem', function() {

  before(function(done) {
    //process.env.CONFIG_DIR = configDir;
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;

    NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            //process.env.CONFIG_DIR)
            configDir)
      .then(function() { return mg.start(3000); })
      .then(function() { return echo.start(8889); })
      .then(function() {
        request = supertest('https://localhost:3000');
      })
      .then(done, function (err) {
        debug(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it('Access resource with token', function (done) {
    requestAccessTokenClientCredentials().then(function (tokens) {
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer ' + tokens.access_token)
        .expect(200, /{ "IBM": 123 }/)
        .end(function (err, res) {
          if (err)
            return done(err);
          done();
        });
    });
  });

});

function requestAccessTokenClientCredentials () {
  // Client data
  var clientId = '6a76c27f-f3f0-47dd-8e58-50924e4a1bab';
  var clientSecret = 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU';

  // Form data
  var data = {
    'grant_type': 'client_credentials',
    'client_id': clientId,
    'client_secret': clientSecret
  };

  return new Promise(function (resolve, reject) {
    request.post('/oauth2/token')
      .type('form')
      .send(data)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect(function(res) {
        assert(res.body.access_token);
        assert(res.body.refresh_token);
        assert.equal(res.body.scope, undefined);
      })
      .end(function (err, res) {
        if (err)
          return reject(err);
        resolve(res.body);
      });
  });
}









