// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var url = require('url');
var assert = require('assert');
var supertest = require('supertest');

var microgw = require('../lib/microgw');
var authServer = require('./support/auth-server');
var apimServer = require('./support/mock-apim-server/apim-server');
var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

function decodeToken(token) {
  //decode the access token into jwt token
  var plain = token.split('.');
  var jwtTkn = JSON.parse(new Buffer(plain[1], 'base64').toString('utf-8'));

  return jwtTkn;
}

function decodeAMP(url) {
  return decodeURIComponent(url.replace(/&amp;/g, '&'));
}

function sendAZRequest(request, done, testCallBack) {
  return function(done) {
    //send the AZ request to the /authorize endpoint
    request.get('/oauth2/authorize')
      .query({ client_id: clientId })
      .query({ response_type: 'code' })
      .query({ scope: 'weather' })
      .query({ redirect_uri: 'https://myApp.com/foo' })
      .query({ state: 'blahblah' })
      .end(function(err, res) {
        try {
          assert(err === null && res.ok === true, 'AZ request failed');

          var cookie = res.header['set-cookie'];
          var actionURL = /action="(.*?)"/g;
          var transactionID = /name="transaction_id".*?value="(.*?)"/g;
          var match = actionURL.exec(res.text);
          var match2 = transactionID.exec(res.text);

          //user authentication
          request.post(decodeAMP(match[1]))
            .set('cookie', cookie[0].split(';')[0])
            .send('j_username=root')
            .send('j_password=Hunter2')
            .send('transaction_id=' + match2[1])
            .end(testCallBack);
        } catch (e) {
          done(e);
        }
      });
  };
}

var clientId = '6a76c27f-f3f0-47dd-8e58-50924e4a1bab';
var clientSecret = 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU';

describe('oauth2 token API', function() {
  var request;
  before(function(done) {
    //Use production instead of CONFIG_DIR: reading from apim instead of laptop
    process.env.NODE_ENV = 'production';

    //The apim server and datastore
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;

    resetLimiterCache();
    apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        __dirname + '/definitions/oauth2-token')
      .then(function() { return microgw.start(3000); })
      .then(function() { return authServer.start(8889); })
      .then(function() {
        request = supertest('https://localhost:3000');
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

    dsCleanup(5000)
      .then(function() { return apimServer.stop(); })
      .then(function() { return microgw.stop(); })
      .then(function() { return authServer.stop(); })
      .then(done, done)
      .catch(done);
  });

  //for the HTTPS connection
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  it('api', function(done) {
    request.get('/stock/quote?symbol=IBM')
      .set('X-IBM-Client-Id', clientId)
      .set('X-IBM-Client-Secret', clientSecret)
      .expect(200, /{ "IBM": 123 }/)
      .end(function(err, res) {
        done(err);
      });
  });

  /**
   * TODO:
   * resource server:
   *   access token expire:
   */

  describe('token endpoint - client credential', function() {
    it('acceptance', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'weather stock' };

      request.post('/oauth2/token')
        .set('X-DUMMY-ID', 'foo')
        .type('form')
        .send(data)
        .expect('Cache-Control', 'no-store')
        .expect('Pragma', 'no-cache')
        .expect('Content-Type', /application\/json/)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);
          assert(res.body.refresh_token);

          //all request headers should not be included in the response
          assert(!res.headers['x-dummy-id'] && !res.headers['X-DUMMY-ID']);

          assert.equal(res.body.scope, 'weather stock');

          var jwtTkn1 = decodeToken(res.body.access_token);
          var jwtTkn2 = decodeToken(res.body.refresh_token);
          //the jwt id should not be undefined
          assert(jwtTkn1.jti);
          assert(jwtTkn2.jti);

          //token should be issued to this client
          assert.equal(jwtTkn1.aud, clientId);
          assert.equal(jwtTkn2.aud, clientId);

          //access token should expire in 7 seconds
          assert(res.body.expires_in, 7);
          assert.equal(7, (jwtTkn1.exp - jwtTkn1.iat) / 1000);
          //while refresh token should expire in 12 seconds
          assert.equal(12, (jwtTkn2.exp - jwtTkn2.iat) / 1000);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('http basic auth', function(done) {
      var data = {
        grant_type: 'client_credentials',
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .auth(clientId, clientSecret)
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);

          var jwtTkn = decodeToken(res.body.access_token);
          assert(jwtTkn.jti);
          assert.equal(jwtTkn.aud, clientId);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('with a valid scope', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert.equal('stock', res.body.scope);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('with two valid scopes', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert.equal('stock weather', res.body.scope);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('without the required scope', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_request');
          assert.equal(res.body.error_description,
                  'Missing required parameter: scope');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('with an invalid scope', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'weather stock foo' };

      request.post('/oauth2/token')
        .set('X-DUMMY-ID', 'foo')
        .type('form')
        .send(data)
        .expect(400)
        .expect('Cache-Control', 'no-store')
        .expect('Pragma', 'no-cache')
        .expect('Content-Type', /application\/json/)
        .expect(function(res) {
          //all request headers should not be included in the response
          assert(!res.headers['x-dummy-id'] && !res.headers['X-DUMMY-ID']);

          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_scope');
          assert.equal(res.body.error_description,
                  'Unrecognized scope "weather,stock,foo"');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('without client_id', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_secret: clientSecret,
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_request');
          assert.equal(res.body.error_description,
                  'Missing required parameter: client_*');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('with bad client_secret', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: 'blah',
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(401)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_client');
          assert.equal(res.body.error_description,
                  'Authentication error');
        })
        .end(function(err, res) {
          done(err);
        });
    });

  });

  describe('token endpoint - password', function() {
    it('acceptance', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'root',
        password: 'Hunter2',
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect('Cache-Control', 'no-store')
        .expect('Pragma', 'no-cache')
        .expect('Content-Type', /application\/json/)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);
          assert(res.body.refresh_token);

          assert.equal(res.body.scope, 'stock weather');

          var jwtTkn1 = decodeToken(res.body.access_token);
          var jwtTkn2 = decodeToken(res.body.refresh_token);

          //the jwt id should not be undefined
          assert(jwtTkn1.jti);
          assert(jwtTkn2.jti);

          //token should be issued to this client
          assert.equal(jwtTkn1.aud, clientId);
          assert.equal(jwtTkn2.aud, clientId);

          //access token should expire in 7 seconds
          assert(res.body.expires_in, 7);
          assert.equal(7, (jwtTkn1.exp - jwtTkn1.iat) / 1000);

          //while refresh token should expire in 12 seconds
          assert.equal(12, (jwtTkn2.exp - jwtTkn2.iat) / 1000);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('confidential client must provide client_secret', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        username: 'root',
        password: 'Hunter2',
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_request');
          assert.equal(res.body.error_description,
                  'Missing required parameter: client_*');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    //client_secret is not required for public client
    it('public client does not provide client_secret', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        username: 'root',
        password: 'Hunter2',
        scope: 'stock weather' };

      request.post('/public/oauth2/token')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);
          assert(res.body.refresh_token);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('user/password are required', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'test300',
        scope: 'stock weather' };

      request.post('/token/password/https')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_request');
          assert.equal(res.body.error_description,
                  'Missing required parameter "password"');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('auth url (http) incorrect password', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'root',
        password: 'badPass',
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(403)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_grant');
          assert.equal(res.body.error_description,
                  'Failed to authenticate the resource owner');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    //skip this for the LDAP server "dpautosrv1.dp.rtp.raleigh.ibm.com" is
    //sometimes not reachable.
    it.skip('user registry (LDAP) ok', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'test300',
        password: 'dp40test',
        scope: 'stock weather' };

      request.post('/token/password/ldap')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);

          var jwtTkn = decodeToken(res.body.access_token);
          assert(jwtTkn.jti);
          assert.equal(jwtTkn.aud, clientId);

          assert(res.body.expires_in, 3600);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    //skip this for the LDAP server "dpautosrv1.dp.rtp.raleigh.ibm.com" is
    //sometimes not reachable.
    it.skip('user registry (LDAP) incorrect password', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'baduser',
        password: 'badpass',
        scope: 'stock weather' };

      request.post('/token/password/ldap')
        .type('form')
        .send(data)
        .expect(403)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_grant');
          assert.equal(res.body.error_description,
                  'Failed to authenticate the resource owner');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('auth url (HTTPS) ok', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'root',
        password: 'Hunter2',
        scope: 'stock weather' };

      request.post('/token/password/https')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);

          var jwtTkn = decodeToken(res.body.access_token);
          assert(jwtTkn.jti);
          assert.equal(jwtTkn.aud, clientId);

          assert(res.body.expires_in, 3600);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('auth url (https without tls profile) ok', function(done) {
      var data = {
        grant_type: 'password',
        client_id: clientId,
        client_secret: clientSecret,
        username: 'root',
        password: 'Hunter2',
        scope: 'stock weather' };

      request.post('/oauth2/token/httpsAuthUrl')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          assert(res.body.access_token);

          var jwtTkn = decodeToken(res.body.access_token);
          assert(jwtTkn.jti);
          assert.equal(jwtTkn.aud, clientId);

          assert(res.body.expires_in, 3600);
        })
        .end(function(err, res) {
          done(err);
        });
    });

  });

  describe('token endpoint - authorization code', function() {
    it('acceptance', function(done) {
      sendAZRequest(request, done, function(err, res) {
        assert(!err, 'Unexpected error with sendAZRequest().');
        try {
          assert(res.statusCode === 302, '302 redirect failed');
          var uri = url.parse(res.header.location, true);
          var code = uri.query.code;

          //get the access token with the AZ code
          var data = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            redirect_uri: 'https://myApp.com/foo' };

          request.post('/oauth2/token')
            .type('form')
            .send(data)
            .expect('Cache-Control', 'no-store')
            .expect('Pragma', 'no-cache')
            .expect('Content-Type', /application\/json/)
            .expect(200)
            .expect(function(res2) {
              assert(res2.body.access_token);
              assert(res2.body.refresh_token);

              assert.equal(res2.body.scope, 'weather');

              var jwtTkn1 = decodeToken(res2.body.access_token);
              var jwtTkn2 = decodeToken(res2.body.refresh_token);

              //the jwt id should not be undefined
              assert(jwtTkn1.jti);
              assert(jwtTkn2.jti);

              //token should be issued to this client
              assert.equal(jwtTkn1.aud, clientId);
              assert.equal(jwtTkn2.aud, clientId);

              //access token should expire in 7 seconds
              assert(res2.body.expires_in, 7);
              assert.equal(7, (jwtTkn1.exp - jwtTkn1.iat) / 1000);

              //while refresh token should expire in 12 seconds
              assert.equal(12, (jwtTkn2.exp - jwtTkn2.iat) / 1000);
            })
            .end(function(err2) {
              done(err2);
            });
        } catch (err) {
          done(err);
        }
      })();
    });

    it('bad credential', function(done) {
      sendAZRequest(request, done, function(err, res) {
        assert(!err, 'Unexpected error with sendAZRequest().');
        try {
          assert(res.statusCode === 302, '302 redirect failed');
          var uri = url.parse(res.header.location, true);
          var code = uri.query.code;

          //get the access token with the AZ code
          var data = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: 'badpass',
            code: code,
            redirect_uri: 'https://myApp.com/foo' };

          request.post('/oauth2/token')
            .type('form')
            .send(data)
            .expect(401)
            .expect(function(res2) {
              //check the error and error description
              assert.equal(res2.body.error,
                      'invalid_client');
              assert.equal(res2.body.error_description,
                      'Authentication error');

              //The previous AZ code should have been deleted
              data.client_secret = clientSecret;
              request.post('/oauth2/token')
                .type('form')
                .send(data)
                .expect(403)
                .expect(function(res3) {
                  //check the error and error description
                  assert.equal(res3.body.error,
                          'invalid_grant');
                  assert.equal(res3.body.error_description,
                          'Invalid authorization code');
                })
                .end(function(err3) {
                  done(err3);
                });
            })
            .end(function(err2) {
              assert(!err2);
            });
        } catch (err) {
          done(err);
        }
      })();
    });

    it('without the required redirect_uri', function(done) {
      sendAZRequest(request, done, function(err, res) {
        assert(!err, 'Unexpected error with sendAZRequest().');
        try {
          assert(res.statusCode === 302, '302 redirect failed');
          var uri = url.parse(res.header.location, true);
          var code = uri.query.code;

          //get the access token with the AZ code
          var data = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code };

          request.post('/oauth2/token')
            .type('form')
            .send(data)
            .expect(403)
            .expect(function(res2) {
              //check the error and error description
              assert.equal(res2.body.error,
                      'invalid_grant');
              assert.equal(res2.body.error_description,
                      'Redirect uri mismatches');
            })
            .end(function(err2) {
              done(err2);
            });
        } catch (err) {
          done(err);
        }
      })();
    });

    it('redirect_uri mismatched', function(done) {
      sendAZRequest(request, done, function(err, res) {
        assert(!err, 'Unexpected error with sendAZRequest().');
        try {
          assert(res.statusCode === 302, '302 redirect failed');
          var uri = url.parse(res.header.location, true);
          var code = uri.query.code;

          //get the access token with the AZ code
          var data = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            scope: 'weather',
            redirect_uri: 'https://myApp.com/MISMATCHED' };

          request.post('/oauth2/token')
            .type('form')
            .send(data)
            .expect(403)
            .expect(function(res2) {
              //check the error and error description
              assert.equal(res2.body.error,
                      'invalid_grant');
              assert.equal(res2.body.error_description,
                      'Redirect uri mismatches');
            })
            .end(function(err2) {
              done(err2);
            });
        } catch (err) {
          done(err);
        }
      })();
    });

    //Check the section 4.1.3, there is no scope parameter for the grant type
    //'authorization_code'. So the scope will just be ignored, no matter it is
    //matched or now.
    it('scope should be ignored', function(done) {
      sendAZRequest(request, done, function(err, res) {
        assert(!err, 'Unexpected error with sendAZRequest().');
        try {
          assert(res.statusCode === 302, '302 redirect failed');
          var uri = url.parse(res.header.location, true);
          var code = uri.query.code;

          //get the access token with the AZ code
          var data = {
            grant_type: 'authorization_code',
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            scope: 'foo bar', //this will be ignored
            redirect_uri: 'https://myApp.com/foo' };

          request.post('/oauth2/token')
            .type('form')
            .send(data)
            .expect(200)
            .expect(function(res2) {
              //The scope was set to 'weather' in the sendAZRequest()
              assert.equal(res2.body.scope, 'weather');
            })
            .end(function(err2) {
              done(err2);
            });
        } catch (err) {
          done(err);
        }
      })();
    });

    it('without the required AZ code', function(done) {
      //get the access token with the AZ code
      var data = {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: 'https://myApp.com/foo' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_request');
          assert.equal(res.body.error_description,
                  'Missing required parameter "code"');
        })
        .end(function(err) {
          done(err);
        });
    });

    it('invalid AZ code', function(done) {
      var invalidCode = 'yRkp15gcddMAYSNX45IfJX2Y5U2JrmX4SQkgHLnsDjs';

      var data = {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code: invalidCode,
        scope: 'foo bar',
        redirect_uri: 'https://myApp.com/foo' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(403)
        .expect(function(res) {
          assert.equal(res.body.error, 'invalid_grant');
          assert.equal(res.body.error_description, 'Invalid authorization code');
        })
        .end(function(err) {
          done(err);
        });
    });

  });

  describe('token endpoint - refresh token', function() {
    it('acceptance', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            scope: 'stock weather' };
          //exchange the refresh token with the access token
          request.post('/oauth2/token')
            .type('form')
            .send(data2)
            .expect(200)
            .expect(function(res2) {
              assert(res2.body.access_token);
              assert(res2.body.refresh_token);

              assert(res2.body.access_token !== res1.body.access_token);
              assert(res2.body.refresh_token !== res1.body.refresh_token);

              assert.equal(res2.body.scope, 'stock weather');

              var jwtTkn1 = decodeToken(res2.body.access_token);
              var jwtTkn2 = decodeToken(res2.body.refresh_token);
              //the jwt id should not be undefined
              assert(jwtTkn1.jti);
              assert(jwtTkn2.jti);

              //token should be issued to this client
              assert.equal(jwtTkn1.aud, clientId);
              assert.equal(jwtTkn2.aud, clientId);

              //access token should expire in 7 seconds
              assert(res2.body.expires_in, 7);
              assert.equal(7, (jwtTkn1.exp - jwtTkn1.iat) / 1000);
              //while refresh token should expire in 12 seconds
              assert.equal(12, (jwtTkn2.exp - jwtTkn2.iat) / 1000);
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    it('scope is optional', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            //The scope is optional for refresh token
            //scope: 'stock weather'
            refresh_token: refreshToken };

          //exchange the refresh token with the access token
          request.post('/oauth2/token')
            .type('form')
            .send(data2)
            .expect(200)
            .expect(function(res2) {
              assert(res2.body.access_token);
              assert(res2.body.refresh_token);
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    it('The requst scope must be subset of grant scope', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            //Oops! stock was not granted
            scope: 'stock weather' };

          //exchange the refresh token with the access token
          request.post('/oauth2/token')
            .type('form')
            .send(data2)
            .expect(403)
            .expect(function(res2) {
              assert.equal(res2.body.error,
                      'invalid_grant');
              assert.equal(res2.body.error_description,
                      'Invalid refresh token');
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    //clients are not allowed to get refresh token from the token endpoint A,
    //and then renew the access token from the token endpoint B.
    it('must not renew the access token using the other API', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            scope: 'stock weather' };

          //exchange the refresh token using the wrong API endpoint
          //the refresh token won't be recognized
          request.post('/public/oauth2/token')
            .type('form')
            .send(data2)
            .expect(403)
            .expect(function(res2) {
              assert.equal(res2.body.error,
                      'invalid_grant');
              assert.equal(res2.body.error_description,
                      'Invalid refresh token');
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    //a public client doesn't need to authenticate with AZ server
    it('public client may skip authentication', function(done) {
      //no client_secret is provided
      var data1 = {
        grant_type: 'password',
        username: 'root',
        password: 'Hunter2',
        client_id: clientId,
        scope: 'stock weather' };

      request.post('/public/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          //no client_secret is provided for the authentication
          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
            scope: 'stock weather' };

          request.post('/public/oauth2/token')
            .type('form')
            .send(data2)
            .expect(200)
            .expect(function(res2) {
              assert(res2.body.access_token);
              assert(res2.body.refresh_token);
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    //if client_secret is provided, it will always be validated
    it('even public client must not provide invalid secret', function(done) {
      //no client_secret is provided
      var data1 = {
        grant_type: 'password',
        username: 'root',
        password: 'Hunter2',
        client_id: clientId,
        scope: 'stock weather' };

      //request the access token
      request.post('/public/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          //invalid client_secret is provided
          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: 'badpass',
            refresh_token: refreshToken,
            scope: 'stock weather' };

          //exchange the refresh token with the access token
          request.post('/public/oauth2/token')
            .type('form')
            .send(data2)
            .expect(401)
            .expect(function(res2) {
              //check the error and error description
              assert.equal(res2.body.error,
                      'invalid_client');
              assert.equal(res2.body.error_description,
                      'Authentication error');
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    it('confidential client must not skip authentication', function(done) {
      var data1 = {
        grant_type: 'password',
        username: 'root',
        password: 'Hunter2',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(200)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          //no client_secret is provided
          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
            scope: 'stock weather' };

          //exchange the refresh token with the access token
          request.post('/oauth2/token')
            .type('form')
            .send(data2)
            .expect(400)
            .expect(function(res2) {
              //check the error and error description
              assert.equal(res2.body.error,
                       'invalid_request');
              assert.equal(res2.body.error_description,
                      'Missing required parameter: client_*');
            })
            .end(function(err, res) {
              done(err);
            });

        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    it('invalid token #1', function(done) {
      var data = {
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: 'CANNOT_BE_VALID',
        scope: 'stock weather' };

      //exchange the refresh token with the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(403)
        .expect(function(res) {
          assert.equal(res.body.error, 'invalid_grant');
          assert.equal(res.body.error_description, 'Invalid refresh token');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('invalid token #2', function(done) {
      var data = {
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJGLUJkZ19xdXdaemUzNnpMX1haem1RTGhtVjZteFY4OGlDRXZCSXVCdVo0Iiwi' +
                       'YXVkIjoiNmE3NmMyN2YtZjNmMC00N2RkLThlNTgtNTA5MjRlNGExYmFiIiwiaWF0IjoxNDY2MDYzOTkxMDY0LCJleHAiO' +
                       'jE0NjYwNjQwMDMwNjR9.K-IVR5f442G0MhIBfQMMybjKm_J1LPrUM0xhPaNC82c',
        scope: 'stock weather' };

      //exchange the refresh token with the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(403)
        .expect(function(res) {
          assert.equal(res.body.error, 'invalid_grant');
          assert.equal(res.body.error_description, 'Invalid refresh token');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('refresh token is not issued when refresh token is disabled', function(done) {
      var data = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      request.post('/oauth2/token/no_refresh')
        .type('form')
        .send(data)
        .expect(200)
        .expect(function(res) {
          //only access token is issued but not refresh token
          assert(res.body.access_token);

          assert(res.body.expires_in, 7);

          assert(!res.body.refresh_token);

          var jwtTkn = decodeToken(res.body.access_token);
          assert(jwtTkn.jti);
          assert.equal(jwtTkn.aud, clientId);
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('no refresh token grant type when refresh token is disabled', function(done) {
      var data = {
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: 'eyJhbGciOiJIUzI1NiJ9.eyJqdGkiOiJGLUJkZ19xdXdaemUzNnpMX1haem1RTGhtVjZteFY4OGlDRXZCSXVCdVo0Iiw' +
                       'iYXVkIjoiNmE3NmMyN2YtZjNmMC00N2RkLThlNTgtNTA5MjRlNGExYmFiIiwiaWF0IjoxNDY2MDYzOTkxMDY0LCJleHA' +
                       'iOjE0NjYwNjQwMDMwNjR9.K-IVR5f442G0MhIBfQMMybjKm_J1LPrUM0xhPaNC82c',
        scope: 'stock weather' };

      request.post('/oauth2/token/no_refresh')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'unsupported_grant_type');
          assert.equal(res.body.error_description,
                  'Unsupported grant type: refresh_token');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('refresh token to expire in "ttl + 1" seconds', function(done) {
      this.timeout(20000);
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            scope: 'stock weather' };

          var timeout = (12 + 1) * 1000;
          console.log('Waiting for %d seconds to test expired refresh token...',
                  timeout / 1000);
          setTimeout(function() {
            //exchange the refresh token with the access token
            request.post('/oauth2/token')
              .type('form')
              .send(data2)
              .expect(function(res2) {
                //check the error and error description
                assert.equal(res2.body.error,
                        'invalid_grant');
                assert.equal(res2.body.error_description,
                        'Invalid refresh token');
              })
              .end(function(err, res) {
                if (err) {
                  console.log('Unexpcted error in refreshing token request:', err);
                }
                done(err);
              });
          }, timeout);
        })
        .end(function(err, res) {
          assert(!err, 'Failed to get access token. ' + (err ? err.toString() : ''));
        });
    });

    it('count == 3', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token; //the first one

          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'stock weather' };

          //exchange the refresh token for another two (=3-1) times
          (function testRefreshTokenCount(token, count) {
            data2.refresh_token = token;

            //exchange the refresh token with the access token
            request.post('/oauth2/token')
              .type('form')
              .send(data2)
              .end(function(err, res2) {
                assert(res2.body.access_token);
                assert(res2.body.expires_in, 7);

                if (count > 0) {
                  var jwtTkn = decodeToken(res2.body.refresh_token);

                  //token should be issued to this client
                  assert.equal(jwtTkn.aud, clientId);
                  assert.equal(12, (jwtTkn.exp - jwtTkn.iat) / 1000);

                  //another exchange
                  testRefreshTokenCount(res2.body.refresh_token, count - 1);
                } else {
                  //This time, no refresh token should be returned.
                  assert(!res2.body.refresh_token);
                  done(err);
                }
              });
          })(refreshToken, 3 - 1);
        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    //same refresh token can only be used for only one time
    it('cannot be used again', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: res1.body.refresh_token,
            scope: 'stock weather' };

          //Use the same refresh token twice. The second time should fail
          function test() {
            var count = 2;
            return function testRefreshToken() {
              //exchange the refresh token with the access token
              request.post('/oauth2/token')
                .type('form')
                .send(data2)
                .end(function(err, res2) {
                  assert(!err, 'Unexpected error');
                  count--;
                  if (count > 0) {
                    //the access token is successfully received
                    assert(res2.body.access_token);
                    testRefreshToken();
                  } else {
                    //failed to request an access token with a used refresh token
                    assert(!res2.body.access_token);
                    assert(!res2.body.refresh_token);

                    assert.equal(res2.body.error,
                            'invalid_grant');
                    assert.equal(res2.body.error_description,
                            'Invalid refresh token');

                    done();
                  }
                });
            };
          }

          test()();
        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    //The given refresh token should be deleted if there is any auth error.
    it('auth error should revoke the token', function(done) {
      var data1 = {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var data2 = {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: res1.body.refresh_token,
            scope: 'stock weather' };

          //The refresh token will be revoked if there is auth error
          function test() {
            var count = 2;
            return function testRefreshToken() {
              data2['client_secret'] = (count > 1 ? 'badpass' : clientSecret);

              //exchange the refresh token with the access token
              request.post('/oauth2/token')
                .type('form')
                .send(data2)
                .end(function(err, res2) {
                  assert(!err, 'Unexpected error');
                  count--;
                  if (count > 0) {
                    //auth error
                    assert(!res2.body.access_token);
                    assert(!res2.body.refresh_token);

                    assert.equal(res2.body.error,
                            'invalid_client');
                    assert.equal(res2.body.error_description,
                            'Authentication error');

                    //call one more time
                    testRefreshToken();
                  } else {
                    //failed to request an access token with a used refresh token
                    assert(!res2.body.access_token);
                    assert(!res2.body.refresh_token);

                    assert.equal(res2.body.error,
                            'invalid_grant');
                    assert.equal(res2.body.error_description,
                            'Invalid refresh token');

                    //test is done
                    done();
                  }
                });
            };
          }

          test()();
        })
        .end(function(err, res) {
          assert(!err);
        });
    });
  });

  describe('token endpoint - misc', function() {
    it('invalid grant type', function(done) {
      var data = {
        grant_type: 'FOO',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'stock weather' };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(400)
        .expect(function(res) {
          assert.equal(res.body.error, 'unsupported_grant_type');
          assert.equal(res.body.error_description, 'Unsupported grant type: FOO');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    //the client doesn't subscribe the plan that include the api
    it('unregistered client', function(done) {
      var clientId2 = '20fd2370-4346-4961-9db7-abdc6d58b3f8';
      var clientSecret2 = 'V1fI2vF1tL0sG1vX6bF7sM7qW2pM7gP1aA3oG5dF8iF4oU1rN7';
      var data = {
        grant_type: 'password',
        client_id: clientId2,
        client_secret: clientSecret2,
        username: 'test300',
        password: 'dp40test',
        scope: 'stock weather' };

      request.post('/token/password/https')
        .type('form')
        .send(data)
        .expect(401)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_client');
          assert.equal(res.body.error_description,
                  'Authentication error');
        })
        .end(function(err, res) {
          done(err);
        });
    });
  });

  describe('token endpoint - cors', function() {
    it('preflight request', function(done) {
      request.options('/oauth2/token')
        .set('Origin', 'http://example.com')
        .set('X-DUMMY-ID', 'dummy')
        .set('Access-Contro-Request-Method', 'POST')
        .set('Access-Contro-Request-Headers', 'X-DUMMY-ID, Content-Type')
        .expect(200)
        .expect('Access-Control-Allow-Origin', 'http://example.com')
        .expect('Access-Control-Allow-Methods', 'POST,OPTIONS')
        //.expect('Access-Control-Allow-Headers', 'X-DUMMY-ID,Content-Type')
        //.expect('X-Powered-By', 'MicroGateway')
        .end(function(err, res) {
          if (res) {
            //empty body
            assert(!res.headers['content-length'] || res.headers['content-length'] === '0');

            assert(res.headers['access-control-expose-headers']
                .indexOf('X-RateLimit-Limit') !== -1);
          }
          done(err);
        });
    });

    it('actual request', function(done) {
      //send the AZ request to the /authorize endpoint
      request.get('/oauth2/authorize')
        .set('X-DUMMY-ID', 'dummy')
        .set('Origin', 'http://myApp.com')
        .set('Referer', 'http://myApp.com/referer')
        .set('Cookie', 'someValue=foo')
        .query({ client_id: clientId })
        .query({ response_type: 'code' })
        .query({ scope: 'weather' })
        .query({ redirect_uri: 'https://myApp.com/foo' })
        .query({ state: 'blahblah' })
        .end(function(err, res) {
          try {
            assert(err === null && res.ok === true, 'AZ request failed');

            assert(res.statusCode === 200);
            assert(res.headers['access-control-allow-origin'] === 'http://myApp.com');
            assert(res.headers['access-control-allow-credentials'] === 'true');
            assert(res.headers['access-control-expose-headers']
                .indexOf('X-RateLimit-Limit') !== -1);

            done();
          } catch (e) {
            done(e);
          }
        });
    });
  });

  var testAppId = '0af99e4b-8d76-4add-bdc5-3aac1c374f21';
  var testAppSecret = 'cB3eU4wQ4dF0oG5iK4dP4nU2wT6iE6kP8hF5rP8oK1iL4yD7pL';
  //the 'test-app' should be able to call the oauth2 API
  it('test-app-enabled', function(done) {
    var data = {
      grant_type: 'client_credentials',
      client_id: testAppId,
      client_secret: testAppSecret,
      scope: 'weather stock' };

    request.post('/oauth2/token/no_refresh')
      .set('X-DUMMY-ID', 'foo')
      .type('form')
      .send(data)
      .expect('Cache-Control', 'no-store')
      .expect('Pragma', 'no-cache')
      .expect('Content-Type', /application\/json/)
      .expect(200)
      .expect(function(res) {
        assert(res.body.access_token);
        assert(!res.body.refresh_token);
      })
      .end(function(err, res) {
        done(err);
      });
  });

});
