// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var Promise = require('bluebird');
var url = require('url');
var path = require('path');
var supertest = require('supertest');
var assert = require('assert');
var qs = require('querystring');

var mg = require('../lib/microgw');
var authServer = require('./support/auth-server');
var apimServer = require('./support/mock-apim-server/apim-server');
var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

var configDir = path.join(__dirname, 'definitions', 'oauth2-ctx');

var request, NODE_TLS_REJECT_UNAUTHORIZED;

describe('oauth ctx testing', function() {

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
      .then(function() { return authServer.start(7000); })
      .then(function() { return mg.start(3000); })
      .then(function() {
        request = supertest('https://localhost:3000');
      })
      .then(done, function(err) {
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return authServer.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(done, done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = NODE_TLS_REJECT_UNAUTHORIZED;
  });

  it('check oauth ctx vars', function(done) {
    requestAccessToken('scope1 scope2').then(function(token) {
      request.get('/use-oauth/getinfo')
        .set('authorization', 'Bearer ' + token)
        .expect(200)
        .end(function(err, res) {
          var oauth = JSON.parse(res.text);
          assert(oauth['access-token'] === token,
            'oauth.access-token is not correct');
          assert(oauth['resource-owner'] === 'root',
            'oauth.resource-owner is not correct');
          assert(oauth['scope'] === 'scope1 scope2',
            'oauth.scope is not correct');
          var iat = convertToDate(oauth['not-before']);
          var exp = convertToDate(oauth['not-after']);
          assert(iat < new Date(), 'not-before is not correct');
          assert(exp.valueOf() - Date.now() < 36000000,
            'exp is not correct');
          done(err);
        });
    }, done);
  });

  it('no oauth ctx vars', function() {
    request.get('/use-oauth/no-oauth')
      .expect(200, /undefined/);
  });

});

function requestAccessToken(scope) {
  scope = scope || 'scope1';
  return new Promise(function(resolve, reject) {
    request.get('/security/oauth2/authorize')
      .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
      .query({ response_type: 'token' })
      .query({ scope: scope })
      .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
      .query({ state: 'xyz' })
      .auth('root', 'Hunter2')
      .end(function(err, res) {
        try {
          assert(res.statusCode === 302, 'not 302 redirect response');
          var location = res.header.location;
          var uri = url.parse(location);
          uri.query = qs.parse(uri.hash.substring(1));

          assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
            'incorrect redirect_uri');
          assert(uri.query.scope === 'scope1 scope2', 'incorrect scope');
          assert(uri.query.state === 'xyz', 'incorrect state');
          assert(uri.query.expires_in === '3600', 'incorrect expires_in');

          assert(location.indexOf('access_token=') !== -1, 'no access_token');
          assert(location.indexOf('token_type=') !== -1, 'no token_type');
          if (err) {
            reject(err);
          } else {
            resolve(uri.query.access_token);
          }
        } catch (e) {
          reject(e);
        }
      });
  });
}

function convertToDate(ISOStr) {
  var MM = [ 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December' ];
  return new Date(ISOStr.replace(
    /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):\d{2}(\w{3})/,
    function($0, $1, $2, $3, $4, $5, $6) {
      return MM[ $2 - 1 ] + ' ' + $3 + ', ' + $1 + ' - ' + $4 % 12 +
        ':' + $5 + (+$4 > 12 ? 'PM' : 'AM') + ' ' + $6;
    }
  ));
}

