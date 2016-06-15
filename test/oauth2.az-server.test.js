// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var assert = require('assert');
var supertest = require('supertest');
var url = require('url');
var qs = require('querystring');

var dsCleanup = require('./support/utils').dsCleanup;
var microgw = require('../lib/microgw');
var authServer = require('./support/auth-server');
var apimServer = require('./support/mock-apim-server/apim-server');


describe('oauth2 AZ-server', function() {

  describe('default login form - authenticated', function() {
    var request, datastoreRequest;
    before(function(done)  {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
              process.env.APIMANAGER,
              process.env.APIMANAGER_PORT,
              __dirname + '/definitions/oauth2-az/default-form-authenticated')
          .then(function() { return microgw.start(5000); })
          .then(function() { return authServer.start(7000); })
          .then(function() {
              request = supertest('https://localhost:5000');
              datastoreRequest = supertest('http://localhost:4000');
          })
          .then(done)
          .catch(function(err) {
              done(err);
              });
    });

    after(function(done) {
      delete process.env.NODE_ENV;
      delete process.env.APIMANAGER;
      delete process.env.APIMANAGER_PORT;
      delete process.env.DATASTORE_PORT;

      dsCleanup(4000)
        .then(function() {return apimServer.stop();})
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    it('greet path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302);
                var location = res2.header.location;
                var uri = url.parse(location);
                uri.query = qs.parse(uri.hash.substring(1));

                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.scope === 'scope1', 'incorrect scope');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.expires_in === '3600', 'incorrect expires_in');

                assert(location.indexOf('access_token=') !== -1, 'no access_token');
                assert(location.indexOf('token_type=') !== -1, 'no token_type');
                done(err);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('greet path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(location.indexOf('code=') !== -1, 'no auth code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'invalid'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_scope', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'invalid'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_scope', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid transaction id - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302);
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.error === 'server_error', 'incorrect error code');
                assert(uri.query.state === 'xyz', 'incorrect state');
                done(err);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid transaction id - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'server_error', 'incorrect error code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302);
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                assert(uri.query.state === 'xyz', 'incorrect state');
                done(err);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

  });

  describe('basic - authenticated', function() {
    var request, datastoreRequest;
    before(function(done)  {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
              process.env.APIMANAGER,
              process.env.APIMANAGER_PORT,
              __dirname + '/definitions/oauth2-az/basic-authenticated')
          .then(function() { return microgw.start(5000); })
          .then(function() { return authServer.start(7000); })
          .then(function() {
              request = supertest('https://localhost:5000');
              datastoreRequest = supertest('http://localhost:4000');
          })
          .then(done)
          .catch(function(err) {
              done(err);
              });
    });

    after(function(done) {
      delete process.env.NODE_ENV;
      delete process.env.APIMANAGER;
      delete process.env.APIMANAGER_PORT;
      delete process.env.DATASTORE_PORT;

      dsCleanup(4000)
        .then(function() {return apimServer.stop();})
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    it('greet path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302);
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));

            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
              'incorrect redirect_uri');
            assert(uri.query.scope === 'scope1', 'incorrect scope');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.expires_in === '3600', 'incorrect expires_in');

            assert(location.indexOf('access_token=') !== -1, 'no access_token');
            assert(location.indexOf('token_type=') !== -1, 'no token_type');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('greet path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect response');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
              'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(location.indexOf('code=') !== -1, 'no auth code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'invalid'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_scope', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'invalid'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_scope', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .auth('root', 'wrongpassword')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302);
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
              'incorrect redirect_uri');
            assert(uri.query.error === 'unauthorized_client', 'in correct error code');
            assert(uri.query.state === 'xyz', 'incorrect state');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .auth('root', 'wrong password')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect response');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
              'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'unauthorized_client', 'in correct error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });
  });


  describe('custom login form - authenticated', function() {
    var request, datastoreRequest;
    before(function(done)  {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
              process.env.APIMANAGER,
              process.env.APIMANAGER_PORT,
              __dirname + '/definitions/oauth2-az/custom-form-authenticated')
          .then(function() { return microgw.start(5000); })
          .then(function() { return authServer.start(7000); })
          .then(function() {
              request = supertest('https://localhost:5000');
              datastoreRequest = supertest('http://localhost:4000');
          })
          .then(done)
          .catch(function(err) {
              done(err);
              });
    });

    after(function(done) {
      delete process.env.NODE_ENV;
      delete process.env.APIMANAGER;
      delete process.env.APIMANAGER_PORT;
      delete process.env.DATASTORE_PORT;
  
      dsCleanup(4000)
        .then(function() {return apimServer.stop();})
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

    it('greet path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302);
                var location = res2.header.location;
                var uri = url.parse(location);
                uri.query = qs.parse(uri.hash.substring(1));
                
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.scope === 'scope1', 'incorrect scope');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                
                assert(location.indexOf('access_token=') !== -1, 'no access_token');
                assert(location.indexOf('token_type=') !== -1, 'no token_type');
                done(err);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });

    });

    it('greet path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(location.indexOf('code=') !== -1, 'no auth code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'invalid'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_scope', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'invalid'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_scope', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid transaction id - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302);
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.error === 'server_error', 'incorrect error code');
                assert(uri.query.state === 'xyz', 'incorrect state');
                done(err);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });

    });

    it('invalid transaction id - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'server_error', 'incorrect error code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'token'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302);
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                assert(uri.query.state === 'xyz', 'incorrect state');
                done(err);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });

    });

    it('user login failed - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid login post - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f'})
        .query({response_type: 'code'})
        .query({scope: 'scope1'})
        .query({redirect_uri: 'https://localhost:5000/use-oauth/getinfo'})
        .query({state: 'xyz'})
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('notusername=root')
            .send('notpassword=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function (err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') == 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                done(err);
              } catch(e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

  });

});

function decodeAMP(url) {
  return decodeURIComponent(url.replace(/&amp;/g, '&'));
}