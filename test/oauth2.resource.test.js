// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
Promise.longStackTraces();
var path = require('path');
var mg = require('../lib/microgw');
var supertest = require('supertest');
var jws = require('jws');
var assert = require('assert');
var debug = require('debug')('tests:oauth');
var apimServer = require('./support/mock-apim-server/apim-server');
var echo = require('./support/echo-server');
var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

//var configDir = path.join(__dirname, 'definitions', 'oauth');
var configDir = path.join(__dirname, 'definitions', 'oauth2-resource');

var request, NODE_TLS_REJECT_UNAUTHORIZED;

describe('oauth testing onprem', function() {

  before(function(done) {
    //process.env.CONFIG_DIR = configDir;
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;

    NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    resetLimiterCache();
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            configDir)
      .then(function() { return mg.start(3000); })
      .then(function() { return echo.start(8889); })
      .then(function() {
        request = supertest('https://localhost:3000');
      })
      .then(done, function(err) {
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

  it('Access resource with token', function(done) {
    requestAccessTokenClientCredentials().then(function(tokens) {
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer ' + tokens.access_token)
        .expect(200, /{ "IBM": 123 }/)
        .end(done);
    }, done);
  });

  it('Access resource with token - extra scope', function(done) {
    requestAccessTokenClientCredentials('stock:quote stock:info').then(function(tokens) {
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer ' + tokens.access_token)
        .expect(200, /{ "IBM": 123 }/)
        .end(done);
    }, done);
  });

  describe('Bad tokens', function() {

    it('Attempt to access resource - wrong scope', function(done) {
      requestAccessTokenClientCredentials('stock:info').then(function(tokens) {
        request.get('/stock/quote?symbol=IBM')
          .set('authorization', 'Bearer ' + tokens.access_token)
          //.expect(401)
          .expect(403)  // TODO verify what response code we should expect here
          .end(done);
      }, done);
    });


    it('Attempt to access resource with expired token', function(done) {
      var access_token = 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJMRjJtMVdXQTVHQURrRFA5MjgzTXFwMVh3Y0dId' +
        'Wd2V2NWQ1FXbWQ0cW1VIiwiYXVkIjoiNmE3NmMyN2YtZjNmMC00N2RkLThlNTgtNTA5MjR' +
        'lNGExYmFiIiwiaWF0IjoxNDY1OTk3MDgwMDIwLCJleHAiOjE0NjU5OTcwODcwMjB9.FKc8' +
        'ikjkAmsGnAuVjU0LwN42pWvWGAL_CK6u4ONjVBg';
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer ' + access_token)
        .expect(401)
        // TODO .expect('WWW-Authenticate', 'Bearer error="invalid_token"')
        .end(done);
    });

    it('Invalid token', function(done) {
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer BADTOKEN')
        .expect(401)
        // TODO .expect('WWW-Authenticate', 'Bearer error="invalid_token"')
        .end(done);
    });

    it('Corrupted signature', function(done) {
      requestAccessTokenClientCredentials().then(function(tokens) {
        request.get('/stock/quote?symbol=IBM')
          .set('authorization', 'Bearer ' + tokens.access_token + 'foobar')
          .expect(401)
          .end(done);
      }, done);
    });

    it('Fabricated token', function(done) {
      var token = {
        header: { alg: 'HS256' },
        payload: {
          jti: 'koc1t3OgERRY6x9oHxIUesNfiUXTboa65BefHrUHjOQ',
          aud: '6a76c27f-f3f0-47dd-8e58-50924e4a1bab',
          iat: '2016-06-02T08:07:57.392Z',
          exp: '2100-01-01T00:00:00.000Z',
          scope: [ '/' ] },
        secret: 'foobar' };
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer ' + jws.sign(token))
        .expect(401)
        .end(done);
    });

    it('Valid token id (jti) with fabricated token', function(done) {
      var token = {
        header: { alg: 'HS256' },
        payload: {
          jti: 'koc1t3OgERRY6x9oHxIUesNfiUXTboa65BefHrUHjOQ',
          aud: '6a76c27f-f3f0-47dd-8e58-50924e4a1bab',
          iat: '2016-06-02T08:07:57.392Z',
          exp: '2100-01-01T00:00:00.000Z',
          scope: [ '/' ] },
        secret: 'foobar' };
      requestAccessTokenClientCredentials().then(function(tokens) {
        var access_token = JSON.parse(jws.decode(tokens.access_token).payload);
        token.payload.jti = access_token.jti;
        request.get('/stock/quote?symbol=IBM')
          .set('authorization', 'Bearer ' + jws.sign(token))
          .expect(401)
          .end(done);
      }, done);
    });

    it('Refresh token as Access token', function(done) {
      requestAccessTokenClientCredentials().then(function(tokens) {
        request.get('/stock/quote?symbol=IBM')
          .set('authorization', 'Bearer ' + tokens.refresh_token)
          .expect(401)
          .end(done);
      }, done);
    });

    it('Missing token', function(done) {
      request.get('/stock/quote?symbol=IBM')
        .set('authorization', 'Bearer ')
        .expect(401)
        .end(done);
    });

    it('Missing authorization header', function(done) {
      request.get('/stock/quote?symbol=IBM')
        .expect(401)
        .end(done);
    });

  });
});

function requestAccessTokenClientCredentials(scope) {
  scope = scope || 'stock:quote';

  // Client data
  var clientId = '6a76c27f-f3f0-47dd-8e58-50924e4a1bab';
  var clientSecret = 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU';

  // Form data
  var data = {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: scope };

  return new Promise(function(resolve, reject) {
    request.post('/oauth2/token')
      .type('form')
      .send(data)
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect(function(res) {
        assert(res.body.access_token);
        assert(res.body.refresh_token);
      })
      .end(function(err, res) {
        if (err) {
          console.log(res);
          return reject(err);
        }
        resolve(res.body);
      });
  });
}

