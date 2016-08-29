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
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;
var microgw = require('../lib/microgw');
var authServer = require('./support/auth-server');
var apimServer = require('./support/mock-apim-server/apim-server');

describe('oauth2 AZ-server', function() {

  describe('default login form - authenticated', function() {
    var request;
    before(function(done) {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      resetLimiterCache();
      apimServer.start(
          process.env.APIMANAGER,
          process.env.APIMANAGER_PORT,
          __dirname + '/definitions/oauth2-az/default-form-authenticated')
        .then(function() { return microgw.start(5000); })
        .then(function() { return authServer.start(7000); })
        .then(function() {
          request = supertest('https://localhost:5000');
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location);
                uri.query = qs.parse(uri.hash.substring(1));

                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.scope === 'scope1', 'incorrect scope');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.expires_in === '3600', 'incorrect expires_in');

                assert(location.indexOf('access_token=') !== -1, 'no access_token');
                assert(location.indexOf('token_type=') !== -1, 'no token_type');
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(location.indexOf('code=') !== -1, 'no auth code');
                done(err2);
              } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
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

    it('empty scope - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: '' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'invalid_request', 'incorrect error code');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('invalid scope - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 403, 'not 403');
                assert(res2.text.indexOf('Unable to load OAuth 2.0 transaction') !== -1,
                    'incorrect error msg');
                done(err2);
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 403, 'not 403');
                assert(res2.text.indexOf('Unable to load OAuth 2.0 transaction') !== -1,
                    'incorrect error msg');
                done(err2);
              } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                //get login form again with error message
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(res2.text.indexOf('At least one of your entries does not match our records') !== -1);
                done(err2);
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                //get login form again with error message
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(res2.text.indexOf('At least one of your entries does not match our records') !== -1);
                done(err2);
              } catch (e2) {
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
    var request;
    before(function(done) {
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
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

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect response');
            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'wrongpassword')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 401, 'not 401');
            assert(res.header['www-authenticate'] === 'Basic realm="apim"',
                'no or incorrect www-authenticate header');
            assert(res.text.indexOf('Failed to authenticate the user') !== -1);
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'wrong password')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 401, 'not 401');
            assert(res.header['www-authenticate'] === 'Basic realm="apim"',
                'no or incorrect www-authenticate header');
            assert(res.text.indexOf('Failed to authenticate the user') !== -1);
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });
  });


  describe('custom login form - authenticated', function() {
    var request;
    before(function(done) {
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location);
                uri.query = qs.parse(uri.hash.substring(1));

                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.scope === 'scope1', 'incorrect scope');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.expires_in === '3600', 'incorrect expires_in');

                assert(location.indexOf('access_token=') !== -1, 'no access_token');
                assert(location.indexOf('token_type=') !== -1, 'no token_type');
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });

    });

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(location.indexOf('code=') !== -1, 'no auth code');
                done(err2);
              } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 403, 'not 403');
                assert(res2.text.indexOf('Unable to load OAuth 2.0 transaction') !== -1,
                    'incorrect error msg');
                done(err2);
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 403, 'not 403');
                assert(res2.text.indexOf('Unable to load OAuth 2.0 transaction') !== -1,
                    'incorrect error msg');
                done(err2);
              } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(/Custom Login Form/.test(res2.text), 'not custom form');
                //check the specific string in custom form when login fails
                assert(res2.text.indexOf('Failed to login! At least one of') !== -1);
                done(err2);
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('username=root')
            .send('password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(/Custom Login Form/.test(res2.text), 'not custom form');
                //check the specific string in custom form when login fails
                assert(res2.text.indexOf('Failed to login! At least one of') !== -1);
                done(err2);
              } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');
            assert(/Custom Login Form/.test(res.text), 'not custom form');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('notusername=root')
            .send('notpassword=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                //login failed, get login page again
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(/Custom Login Form/.test(res2.text), 'not custom form');
                //check the specific string in custom form when login fails
                assert(res2.text.indexOf('Failed to login! At least one of') !== -1);
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

  });

  describe('redirect', function() {
    var request;
    before(function(done) {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
          process.env.APIMANAGER,
          process.env.APIMANAGER_PORT,
          __dirname + '/definitions/oauth2-az/redirect')
        .then(function() { return microgw.start(5000); })
        .then(function() { return authServer.start(7000); })
        .then(function() {
          request = supertest('https://localhost:5000');
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');

            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('http://localhost:7010/redirect') === 0,
              'incorrect redirect_uri');

            assert(_.isString(uri.query['original-url']), 'no original-url');
            assert(_.isString(uri.query['app-name']), 'no app-name');

            var originalURL = url.parse(decodeURIComponent(uri.query['original-url']), true);

            var back2AZ = request.get(originalURL.pathname);
            back2AZ.set('cookie', cookie[0].split(';')[0]);
            for (var qsname in originalURL.query) {
              var obj = {};
              obj[qsname] = originalURL.query[qsname];
              back2AZ.query(obj);
            }
            back2AZ.query({ username: 'root' })
            .query({ confirmation: 'Hunter2' })
            .query({ 'app-name': uri.query['app-name'] })
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location);
                uri.query = qs.parse(uri.hash.substring(1));

                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
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

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');

            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('http://localhost:7010/redirect') === 0,
              'incorrect redirect_uri');
            assert(_.isString(uri.query['original-url']), 'no original-url');
            assert(_.isString(uri.query['app-name']), 'no app-name');

            var originalURL = url.parse(decodeURIComponent(uri.query['original-url']), true);

            var back2AZ = request.get(originalURL.pathname);
            back2AZ.set('cookie', cookie[0].split(';')[0]);
            for (var qsname in originalURL.query) {
              var obj = {};
              obj[qsname] = originalURL.query[qsname];
              back2AZ.query(obj);
            }
            back2AZ.query({ username: 'root' })
            .query({ confirmation: 'Hunter2' })
            .query({ 'app-name': uri.query['app-name'] })
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(location.indexOf('code=') !== -1, 'no auth code');
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

    it('incorrect confirmation - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');

            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('http://localhost:7010/redirect') === 0,
              'incorrect redirect_uri');
            assert(_.isString(uri.query['original-url']), 'no original-url');
            assert(_.isString(uri.query['app-name']), 'no app-name');

            var originalURL = url.parse(decodeURIComponent(uri.query['original-url']), true);

            var back2AZ = request.get(originalURL.pathname);
            back2AZ.set('cookie', cookie[0].split(';')[0]);
            for (var qsname in originalURL.query) {
              var obj = {};
              obj[qsname] = originalURL.query[qsname];
              back2AZ.query(obj);
            }
            back2AZ.query({ username: 'root' })
            .query({ confirmation: 'wrongpassword' })
            .query({ 'app-name': uri.query['app-name'] })
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 401, 'not 401');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(res2.text.indexOf('Failed to authenticate the user') !== -1);
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('incorrect confirmation - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');

            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('http://localhost:7010/redirect') === 0,
              'incorrect redirect_uri');
            assert(_.isString(uri.query['original-url']), 'no original-url');
            assert(_.isString(uri.query['app-name']), 'no app-name');

            var originalURL = url.parse(decodeURIComponent(uri.query['original-url']), true);

            var back2AZ = request.get(originalURL.pathname);
            back2AZ.set('cookie', cookie[0].split(';')[0]);
            for (var qsname in originalURL.query) {
              var obj = {};
              obj[qsname] = originalURL.query[qsname];
              back2AZ.query(obj);
            }
            back2AZ.query({ username: 'root' })
            .query({ confirmation: 'wrongpassword' })
            .query({ 'app-name': uri.query['app-name'] })
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 401, 'not 401');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(res2.text.indexOf('Failed to authenticate the user') !== -1);
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('error response - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');

            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('http://localhost:7010/redirect') === 0,
              'incorrect redirect_uri');
            assert(_.isString(uri.query['original-url']), 'no original-url');
            assert(_.isString(uri.query['app-name']), 'no app-name');

            var originalURL = url.parse(decodeURIComponent(uri.query['original-url']), true);

            var back2AZ = request.get(originalURL.pathname);
            back2AZ.set('cookie', cookie[0].split(';')[0]);
            for (var qsname in originalURL.query) {
              var obj = {};
              obj[qsname] = originalURL.query[qsname];
              back2AZ.query(obj);
            }
            back2AZ.query({ username: 'root' })
            .query({ error: 'error from redirect AH/AZ' })
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location);
                uri.query = qs.parse(uri.hash.substring(1));
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('error response - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');

            var location = res.header.location;
            var uri = url.parse(location, true);
            assert(location.indexOf('http://localhost:7010/redirect') === 0,
              'incorrect redirect_uri');
            assert(_.isString(uri.query['original-url']), 'no original-url');
            assert(_.isString(uri.query['app-name']), 'no app-name');

            var originalURL = url.parse(decodeURIComponent(uri.query['original-url']), true);

            var back2AZ = request.get(originalURL.pathname);
            back2AZ.set('cookie', cookie[0].split(';')[0]);
            for (var qsname in originalURL.query) {
              var obj = {};
              obj[qsname] = originalURL.query[qsname];
              back2AZ.query(obj);
            }
            back2AZ.query({ username: 'root' })
            .query({ error: 'error from redirect AH/AZ' })
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 302, 'not 302 redirect response');
                var location = res2.header.location;
                var uri = url.parse(location, true);
                assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                  'incorrect redirect_uri');
                assert(uri.query.state === 'xyz', 'incorrect state');
                assert(uri.query.error === 'unauthorized_client', 'incorrect error code');
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

  });

  describe('basic - default consent', function() {
    var request;
    before(function(done) {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
          process.env.APIMANAGER,
          process.env.APIMANAGER_PORT,
          __dirname + '/definitions/oauth2-az/basic-default-consent')
        .then(function() { return microgw.start(5000); })
        .then(function() { return authServer.start(7000); })
        .then(function() {
          request = supertest('https://localhost:5000');
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location);
                  uri.query = qs.parse(uri.hash.substring(1));
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.scope === 'scope1 scope2 scope3', 'incorrect scope');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                  assert(location.indexOf('access_token=') !== -1, 'no access_token');
                  assert(location.indexOf('token_type=') !== -1, 'no token_type');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location, true);

                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(location.indexOf('code=') !== -1, 'no auth code');
                  done(err2);
                } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'wrongpassword')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 401, 'not 401');
            assert(res.header['www-authenticate'] === 'Basic realm="apim"',
                'no or incorrect www-authenticate header');
            assert(res.text.indexOf('Failed to authenticate the user') !== -1);
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'wrong password')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 401, 'not 401');
            assert(res.header['www-authenticate'] === 'Basic realm="apim"',
                'no or incorrect www-authenticate header');
            assert(res.text.indexOf('Failed to authenticate the user') !== -1);
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });


    it('select fewer scopes - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';
            form.selectedscope = 'scope1';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location);
                  uri.query = qs.parse(uri.hash.substring(1));
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.scope === 'scope1', 'incorrect scope');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                  assert(location.indexOf('access_token=') !== -1, 'no access_token');
                  assert(location.indexOf('token_type=') !== -1, 'no token_type');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('select fewer scopes - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';
            form.selectedscope = 'scope1';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location, true);
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(location.indexOf('code=') !== -1, 'no code');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('deny access - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'false';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location);
                  uri.query = qs.parse(uri.hash.substring(1));
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.error === 'access_denied', 'incorrect error code');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('deny access - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'false';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location, true);
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.error === 'access_denied', 'incorrect error code');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

  });

  describe('default login form - default consent', function() {
    var request;
    before(function(done) {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
          process.env.APIMANAGER,
          process.env.APIMANAGER_PORT,
          __dirname + '/definitions/oauth2-az/default-form-default-consent')
        .then(function() { return microgw.start(5000); })
        .then(function() { return authServer.start(7000); })
        .then(function() {
          request = supertest('https://localhost:5000');
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
              .set('cookie', cookie[0].split(';')[0])
              .send('j_username=root')
              .send('j_password=Hunter2')
              .send('transaction_id=' + match2[1])
              .end(function(err2, res2) {
                try {
                  assert(err2 === null && res2.ok === true, 'can not get consent form');
                  var cookie = res2.header['set-cookie'];
                  assert(cookie !== undefined, 'no cookie');
                  var form = parseConsentForm(res2.text);

                  assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                      'incorrect redirectURI');
                  assert(form.scope === 'scope1 scope2 scope3',
                      'incorrect scope');
                  assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                      'incorrect client_id');
                  assert(form.resOwner === 'root', 'incorrect resource owner');
                  assert(form.dpState !== undefined, 'incorrect dp-state');

                  var actionURL = /action="(.*?)"/g;
                  var match = actionURL.exec(res2.text);
                  form.approve = 'true';

                  submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
                    .end(function(err3, res3) {
                      try {
                        assert(res3.statusCode === 302, 'not 302 redirect');
                        var location = res3.header.location;
                        var uri = url.parse(location);
                        uri.query = qs.parse(uri.hash.substring(1));
                        assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                            'incorrect redirect_uri');
                        assert(uri.query.scope === 'scope1 scope2 scope3', 'incorrect scope');
                        assert(uri.query.state === 'xyz', 'incorrect state');
                        assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                        assert(location.indexOf('access_token=') !== -1, 'no access_token');
                        assert(location.indexOf('token_type=') !== -1, 'no token_type');
                        done(err3);
                      } catch (e3) {
                        done(e3);
                      }
                    });
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
              .set('cookie', cookie[0].split(';')[0])
              .send('j_username=root')
              .send('j_password=Hunter2')
              .send('transaction_id=' + match2[1])
              .end(function(err2, res2) {
                try {
                  assert(err2 === null && res2.ok === true, 'can not get consent form');
                  var cookie = res2.header['set-cookie'];
                  assert(cookie !== undefined, 'no cookie');
                  var form = parseConsentForm(res2.text);

                  assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                      'incorrect redirectURI');
                  assert(form.scope === 'scope1 scope2 scope3',
                      'incorrect scope');
                  assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                      'incorrect client_id');
                  assert(form.resOwner === 'root', 'incorrect resource owner');
                  assert(form.dpState !== undefined, 'incorrect dp-state');

                  var actionURL = /action="(.*?)"/g;
                  var match = actionURL.exec(res2.text);
                  form.approve = 'true';

                  submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
                    .end(function(err3, res3) {
                      try {
                        assert(res3.statusCode === 302, 'not 302 redirect');
                        var location = res3.header.location;
                        var uri = url.parse(location, true);

                        assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                          'incorrect redirect_uri');
                        assert(uri.query.state === 'xyz', 'incorrect state');
                        assert(location.indexOf('code=') !== -1, 'no auth code');
                        done(err3);
                      } catch (e3) {
                        done(e3);
                      }
                    });
                } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 403, 'not 403');
                assert(res2.text.indexOf('Unable to load OAuth 2.0 transaction') !== -1,
                    'incorrect error msg');
                done(err2);
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=invalidtransactionid')
            .end(function(err2, res2) {
              try {
                assert(res2.statusCode === 403, 'not 403');
                assert(res2.text.indexOf('Unable to load OAuth 2.0 transaction') !== -1,
                    'incorrect error msg');
                done(err2);
              } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                //login fails, get login form again
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(res2.text.indexOf('At least one of your entries does not match our records') !== -1);
                done(err2);
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=wrongpassword')
            .send('transaction_id=' + match2[1])
            .end(function(err2, res2) {
              try {
                //login fails, get login form again
                assert(res2.statusCode === 200, 'not 200');
                assert(res2.header['www-authenticate'] === undefined,
                    'extra www-authenticate header');
                assert(res2.text.indexOf('At least one of your entries does not match our records') !== -1);
                done(err2);
              } catch (e2) {
                done(e2);
              }
            });
          } catch (e) {
            done(e);
          }
        });
    });

    it('select fewer scopes - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
              .set('cookie', cookie[0].split(';')[0])
              .send('j_username=root')
              .send('j_password=Hunter2')
              .send('transaction_id=' + match2[1])
              .end(function(err2, res2) {
                try {
                  assert(err2 === null && res2.ok === true, 'can not get consent form');
                  var cookie = res2.header['set-cookie'];
                  assert(cookie !== undefined, 'no cookie');
                  var form = parseConsentForm(res2.text);
                  assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                      'incorrect redirectURI');
                  assert(form.scope === 'scope1 scope2 scope3',
                      'incorrect scope');
                  assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                      'incorrect client_id');
                  assert(form.resOwner === 'root', 'incorrect resource owner');
                  assert(form.dpState !== undefined, 'incorrect dp-state');

                  var actionURL = /action="(.*?)"/g;
                  var match = actionURL.exec(res2.text);
                  form.approve = 'true';
                  form.selectedscope = 'scope1';

                  submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
                    .end(function(err3, res3) {
                      try {
                        assert(res3.statusCode === 302, 'not 302 redirect');
                        var location = res3.header.location;
                        var uri = url.parse(location);
                        uri.query = qs.parse(uri.hash.substring(1));
                        assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                          'incorrect redirect_uri');
                        assert(uri.query.scope === 'scope1', 'incorrect scope');
                        assert(uri.query.state === 'xyz', 'incorrect state');
                        assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                        assert(location.indexOf('access_token=') !== -1, 'no access_token');
                        assert(location.indexOf('token_type=') !== -1, 'no token_type');
                        done(err3);
                      } catch (e3) {
                        done(e3);
                      }
                    });
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('select fewer scopes - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no set-cookie');

            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);

            request.post(decodeAMP(match[1]))
              .set('cookie', cookie[0].split(';')[0])
              .send('j_username=root')
              .send('j_password=Hunter2')
              .send('transaction_id=' + match2[1])
              .end(function(err2, res2) {
                try {
                  assert(err2 === null && res2.ok === true, 'can not get consent form');
                  var cookie = res2.header['set-cookie'];
                  assert(cookie !== undefined, 'no cookie');
                  var form = parseConsentForm(res2.text);
                  assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                      'incorrect redirectURI');
                  assert(form.scope === 'scope1 scope2 scope3',
                      'incorrect scope');
                  assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                      'incorrect client_id');
                  assert(form.resOwner === 'root', 'incorrect resource owner');
                  assert(form.dpState !== undefined, 'incorrect dp-state');

                  var actionURL = /action="(.*?)"/g;
                  var match = actionURL.exec(res2.text);
                  form.approve = 'true';
                  form.selectedscope = 'scope1';

                  submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
                    .end(function(err3, res3) {
                      try {
                        assert(res3.statusCode === 302, 'not 302 redirect');
                        var location = res3.header.location;
                        var uri = url.parse(location, true);
                        assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                          'incorrect redirect_uri');
                        assert(uri.query.state === 'xyz', 'incorrect state');
                        assert(location.indexOf('code=') !== -1, 'no code');
                        done(err3);
                      } catch (e3) {
                        done(e3);
                      }
                    });
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('deny access - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);
            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);
            request.post(decodeAMP(match[1]))
              .set('cookie', cookie[0].split(';')[0])
              .send('j_username=root')
              .send('j_password=Hunter2')
              .send('transaction_id=' + match2[1])
              .end(function(err2, res2) {
                try {
                  assert(err2 === null && res2.ok === true, 'can not get consent form');
                  var cookie = res2.header['set-cookie'];
                  assert(cookie !== undefined, 'no cookie');
                  var form = parseConsentForm(res2.text);

                  assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                      'incorrect redirectURI');
                  assert(form.scope === 'scope1 scope2 scope3',
                    'incorrect scope');
                  assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                      'incorrect client_id');
                  assert(form.resOwner === 'root', 'incorrect resource owner');
                  assert(form.dpState !== undefined, 'incorrect dp-state');

                  var actionURL = /action="(.*?)"/g;
                  var match = actionURL.exec(res2.text);
                  form.approve = 'false';

                  submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
                    .end(function(err3, res3) {
                      try {
                        assert(res3.statusCode === 302, 'not 302 redirect');
                        var location = res3.header.location;
                        var uri = url.parse(location);
                        uri.query = qs.parse(uri.hash.substring(1));
                        assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                          'incorrect redirect_uri');
                        assert(uri.query.state === 'xyz', 'incorrect state');
                        assert(uri.query.error === 'access_denied', 'incorrect error code');
                        done(err3);
                      } catch (e3) {
                        done(e3);
                      }
                    });
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('deny access - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'initial AZ request failed');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined);
            var actionURL = /action="(.*?)"/g;
            var transactionID = /name="transaction_id".*?value="(.*?)"/g;
            var match = actionURL.exec(res.text);
            var match2 = transactionID.exec(res.text);
            request.post(decodeAMP(match[1]))
              .set('cookie', cookie[0].split(';')[0])
              .send('j_username=root')
              .send('j_password=Hunter2')
              .send('transaction_id=' + match2[1])
              .end(function(err2, res2) {
                try {
                  assert(err2 === null && res2.ok === true, 'can not get consent form');
                  var cookie = res2.header['set-cookie'];
                  assert(cookie !== undefined, 'no cookie');
                  var form = parseConsentForm(res2.text);

                  assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                      'incorrect redirectURI');
                  assert(form.scope === 'scope1 scope2 scope3',
                      'incorrect scope');
                  assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                      'incorrect client_id');
                  assert(form.resOwner === 'root', 'incorrect resource owner');
                  assert(form.dpState !== undefined, 'incorrect dp-state');

                  var actionURL = /action="(.*?)"/g;
                  var match = actionURL.exec(res2.text);
                  form.approve = 'false';

                  submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
                    .end(function(err3, res3) {
                      try {
                        assert(res3.statusCode === 302, 'not 302 redirect');
                        var location = res3.header.location;
                        var uri = url.parse(location, true);
                        assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                          'incorrect redirect_uri');
                        assert(uri.query.state === 'xyz', 'incorrect state');
                        assert(uri.query.error === 'access_denied', 'incorrect error code');
                        done(err3);
                      } catch (e3) {
                        done(e3);
                      }
                    });
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe('basic - custom consent', function() {
    var request;
    before(function(done) {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
          process.env.APIMANAGER,
          process.env.APIMANAGER_PORT,
          __dirname + '/definitions/oauth2-az/basic-custom-consent')
        .then(function() { return microgw.start(5000); })
        .then(function() { return authServer.start(7000); })
        .then(function() {
          request = supertest('https://localhost:5000');
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('green path - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);
            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');
            assert(/This is custom consent form/.test(res.text),
                'not custom consent form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location);
                  uri.query = qs.parse(uri.hash.substring(1));
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.scope === 'scope1 scope2 scope3', 'incorrect scope');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                  assert(location.indexOf('access_token=') !== -1, 'no access_token');
                  assert(location.indexOf('token_type=') !== -1, 'no token_type');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('green path - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');
            assert(/This is custom consent form/.test(res.text),
                'not custom consent form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location, true);

                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(location.indexOf('code=') !== -1, 'no auth code');
                  done(err2);
                } catch (e2) {
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.statusCode === 302, 'incorrect status code');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'invalid' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
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
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'wrongpassword')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 401, 'not 401');
            assert(res.header['www-authenticate'] === 'Basic realm="apim"',
                'no or incorrect www-authenticate header');
            assert(res.text.indexOf('Failed to authenticate the user') !== -1);
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('user login failed - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'wrong password')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 401, 'not 401');
            assert(res.header['www-authenticate'] === 'Basic realm="apim"',
                'no or incorrect www-authenticate header');
            assert(res.text.indexOf('Failed to authenticate the user') !== -1);
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('deny access - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');
            assert(/This is custom consent form/.test(res.text),
                'not custom consent form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'false';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location);
                  uri.query = qs.parse(uri.hash.substring(1));
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.error === 'access_denied', 'incorrect error code');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('incorrect dp-state - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');
            assert(/This is custom consent form/.test(res.text),
                'not custom consent form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';
            form.dpState = 'incorrect';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 403, 'not 403 forbidden');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('incorrect dp-state - code', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'code' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);

            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');
            assert(/This is custom consent form/.test(res.text),
                'not custom consent form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';
            form.dpState = 'incorrect';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 403, 'not 403 forbidden');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });

    it('no redirect_uri - token', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'can not get consent form');
            var cookie = res.header['set-cookie'];
            assert(cookie !== undefined, 'no cookie');
            var form = parseConsentForm(res.text);
            assert(form.redirectURI === 'https://localhost:5000/use-oauth/getinfo',
                'incorrect redirectURI');
            assert(form.scope === 'scope1 scope2 scope3',
                'incorrect scope');
            assert(form.clientID === '2609421b-4a69-40d7-8f13-44bdf3edd18f',
                'incorrect client_id');
            assert(form.resOwner === 'root', 'incorrect resource owner');
            assert(form.dpState !== undefined, 'incorrect dp-state');
            assert(/This is custom consent form/.test(res.text),
                'not custom consent form');

            var actionURL = /action="(.*?)"/g;
            var match = actionURL.exec(res.text);
            form.approve = 'true';

            submitAuthReq(request, match[1], cookie[0].split(';')[0], form)
              .end(function(err2, res2) {
                try {
                  assert(res2.statusCode === 302, 'not 302 redirect');
                  var location = res2.header.location;
                  var uri = url.parse(location);
                  uri.query = qs.parse(uri.hash.substring(1));
                  assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
                    'incorrect redirect_uri');
                  assert(uri.query.scope === 'scope1 scope2 scope3', 'incorrect scope');
                  assert(uri.query.state === 'xyz', 'incorrect state');
                  assert(uri.query.expires_in === '3600', 'incorrect expires_in');
                  assert(location.indexOf('access_token=') !== -1, 'no access_token');
                  assert(location.indexOf('token_type=') !== -1, 'no token_type');
                  done(err2);
                } catch (e2) {
                  done(e2);
                }
              });
          } catch (e) {
            done(e);
          }
        });
    });
  });

  describe('basic - bad custom consent', function() {
    var request;
    before(function(done) {
      //Use production instead of CONFIG_DIR: reading from apim instead of laptop
      process.env.NODE_ENV = 'production';

      //The apim server and datastore
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8000;
      process.env.DATASTORE_PORT = 4000;

      apimServer.start(
          process.env.APIMANAGER,
          process.env.APIMANAGER_PORT,
          __dirname + '/definitions/oauth2-az/basic-bad-custom-consent')
        .then(function() { return microgw.start(5000); })
        .then(function() { return authServer.start(7000); })
        .then(function() {
          request = supertest('https://localhost:5000');
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
        .then(function() { return apimServer.stop(); })
        .then(function() { return microgw.stop(); })
        .then(function() { return authServer.stop(); })
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('unable to load custom form', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
              'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'server_error', 'incorrect error code');
            assert(uri.query.error_description.indexOf('Unable to load the custom form') !== -1,
                'incorrect error description');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

    it('unable to load custom form', function(done) {
      request.get('/security/oauth2/authorize')
        .query({ client_id: '2609421b-4a69-40d7-8f13-44bdf3edd18f' })
        .query({ response_type: 'token' })
        .query({ scope: 'scope1 scope2 scope3' })
        .query({ redirect_uri: 'https://localhost:5000/use-oauth/getinfo' })
        .query({ state: 'xyz' })
        .auth('root', 'Hunter2')
        .end(function(err, res) {
          try {
            assert(res.statusCode === 302, 'not 302 redirect');
            var location = res.header.location;
            var uri = url.parse(location);
            uri.query = qs.parse(uri.hash.substring(1));
            assert(location.indexOf('https://localhost:5000/use-oauth/getinfo') === 0,
              'incorrect redirect_uri');
            assert(uri.query.state === 'xyz', 'incorrect state');
            assert(uri.query.error === 'server_error', 'incorrect error code');
            assert(uri.query.error_description.indexOf('Unable to load the custom form') !== -1,
                'incorrect error description');
            done(err);
          } catch (e) {
            done(e);
          }
        });
    });

  });

  describe('custom consent form - non-end-2-end', function() {
    var customConsentForm = require('../lib/oauth2/az-server/middleware/custom-consent-form');
    before(function(done) {
      apimServer.start(
          '127.0.0.1',
          '8010',
          __dirname + '/definitions/oauth2-az/custom-consent-form')
        .then(done)
        .catch(function(err) {
          done(err);
        });
      process.on('uncaughtException', function(e) {
        console.error(e.stack);
      });
    });

    after(function(done) {

      apimServer.stop()
        .then(done, done)
        .catch(done);
    });

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    it('no input fields element', function(done) {
      var server = { _respond: function(oauth2, ctx, cb) {
        //in this test case, this shouldn't be called
      } };
      var handler = customConsentForm(
        {
          url: 'https://127.0.0.1:8010/no-input-fields.html',
          server: server,
        });

      handler({}, {}, function(error) {
        assert(error && error.code === 'server_error',
            'should create AuthorizationError');
        done();
      });
    });

    it('no form element', function(done) {
      var server = { _respond: function(oauth2, ctx, cb) {
        //in this test case, this shouldn't be called
      } };
      var handler = customConsentForm(
        {
          url: 'https://127.0.0.1:8010/no-form.html',
          server: server,
        });

      handler({}, {}, function(error) {
        assert(error && error.code === 'server_error',
            'should create AuthorizationError');
        done();
      });
    });

    it('no approve button', function(done) {
      var server = { _respond: function(oauth2, ctx, cb) {
        //in this test case, this shouldn't be called
      } };
      var handler = customConsentForm(
        {
          url: 'https://127.0.0.1:8010/no-approve.html',
          server: server,
        });

      handler({}, {}, function(error) {
        assert(error && error.code === 'server_error',
            'should create AuthorizationError');
        done();
      });
    });

    it('check element replacement', function(done) {
      var server = { _respond: function(oauth2, ctx, cb) {
        //in this test case, this shouldn't be called
      } };
      var handler = customConsentForm(
        {
          url: 'https://127.0.0.1:8010/custom-consent-form.html',
          server: server,
        });
      var req = {
        oauth2: {
          transactionID: 'transactionID',
          user: { id: 'USERID' },
          req: {
            clientID: 'clientID',
            scope: [ 'scope1', 'scope2' ],
          },
          redirectURI: 'REDIRECTURI',
          client: { title: 'CLIENTTITLE' },
        },
        ctx: {
          request: { path: 'path', search: 'search' },
          message: {},
        },
      };
      handler(req, {}, function(error) {
        var re1 = /Greeting\.\.([\s\S]*)USERID/;
        var re2 = /This app([\s\S]*)CLIENTTITLE/;
        var re3 = /redirect URI:REDIRECTURI/;
        assert(re1.test(req.ctx.message.body), 'missing resource owner');
        assert(re2.test(req.ctx.message.body), 'missing application name');
        assert(re3.test(req.ctx.message.body), 'missing redirect uri');
        done(error === 'route' ? undefined : error);
      });
    });

  });

});

/*
 * compose a request to submit an authorization form
 */
function submitAuthReq(request, actionUri, cookie, form) {
  var rev = request.post(actionUri)
  .set('cookie', cookie)
  .send('dp-state=' + encodeURIComponent(form.dpState))
  .send('resource-owner=' + encodeURIComponent(form.resOwner))
  .send('redirect_uri=' + encodeURIComponent(form.redirectURI))
  .send('scope=' + encodeURIComponent(form.scope))
  .send('original-url=' + encodeURIComponent(form.originalURL))
  .send('client_id=' + encodeURIComponent(form.clientID))
  .send('dp-data=' + encodeURIComponent(form.dpData));

  if (form.selectedscope) {
    rev = rev.send('selectedscope=' + encodeURIComponent(form.selectedscope));
  }

  return rev.send('approve=' + encodeURIComponent(form.approve));
}

function decodeAMP(url) {
  return decodeURIComponent(url.replace(/&amp;/g, '&'));
}

function parseConsentForm(html) {
  var re = {
    dpState: /name="dp-state".*?value="(.*?)"/g,
    resOwner: /name="resource-owner".*?value="(.*?)"/g,
    redirectURI: /name="redirect_uri".*?value="(.*?)"/g,
    scope: /name="scope".*?value="(.*?)"/g,
    originalURL: /name="original-url".*?value="(.*?)"/g,
    clientID: /name="client_id".*?value="(.*?)"/g,
    dpData: /name="dp-data".*?value="(.*?)"/g };

  var rev = {};
  for (var one in re) {
    rev[one] = re[one].exec(html)[1];
  }

  return rev;
}
