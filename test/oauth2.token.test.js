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

function decodeToken(token) {
  //decode the access token into jwt token
  var plain = token.split('.');
  var jwtTkn = JSON.parse(new Buffer(plain[1], 'base64').toString('utf-8'));

  return jwtTkn;
}

var clientId = '6a76c27f-f3f0-47dd-8e58-50924e4a1bab';
var clientSecret = 'oJ2xB4aM0tB5pP3aS5dF8oS1jB5hA1dI5dR0dW1sJ0gG6nK0xU';

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

  //for the HTTPS connection
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

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
   *
   * access token expire:
   *
   * negatives:
   *   bad request
   *
   * password:
   *   user auth (http, https, ldap)
   */

  describe('token endpoint - client credential', function() {
    it('acceptance', function(done) {
      var data = {
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret
      };

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

          assert.equal(res.body.scope, undefined);

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
          'grant_type': 'client_credentials',
          'scope': 'stock'
      };

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
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret,
          'scope': 'stock'
      };

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
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret,
          'scope': 'stock weather'
      };

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

    it('with an invalid scope', function(done) {
      var data = {
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret,
          'scope': 'stock foo weather'
      };

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
                  'Unrecognized scope "stock,foo,weather"');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('without client_id', function(done) {
      var data = {
          'grant_type': 'client_credentials',
          'client_secret': clientSecret,
          'scope': 'stock foo weather'
      };

      request.post('/oauth2/token')
        .type('form')
        .send(data)
        .expect(401)
        .expect(function(res) {
          //check the error and error description
          assert.equal(res.body.error,
                  'invalid_client');
          assert.equal(res.body.error_description,
                  'Missing required parameter: client_*');
        })
        .end(function(err, res) {
          done(err);
        });
    });

    it('with bad client_secret', function(done) {
      var data = {
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': 'blah',
          'scope': 'stock weather'
      };

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
          'grant_type': 'password',
          'client_id': clientId,
          'client_secret': clientSecret,
          'username': 'root',
          'password': 'Hunter2'
      };

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

    it('user without password', function(done) {
      var data = {
          'grant_type': 'password',
          'client_id': clientId,
          'client_secret': clientSecret,
          'username': 'test300'
      };

      request.post('/token/password/ldap')
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

    it('user auth (http) fails', function(done) {
      var data = {
          'grant_type': 'password',
          'client_id': clientId,
          'client_secret': clientSecret,
          'username': 'root',
          'password': 'badPass'
      };

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

    //to run this testcase, make sure that the LDAP server
    // (dpautosrv1.dp.rtp.raleigh.ibm.com) is reachable
    it('user auth (LDAP) ok', function(done) {
      var data = {
          'grant_type': 'password',
          'client_id': clientId,
          'client_secret': clientSecret,
          'username': 'test300',
          'password': 'dp40test'
      };

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

    it('bad user auth (LDAP)', function(done) {
      var data = {
          'grant_type': 'password',
          'client_id': clientId,
          'client_secret': clientSecret,
          'username': 'baduser',
          'password': 'badpass'  //invalid user password
      };

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

  });

  describe('token endpoint - refresh token', function() {
    it('acceptance', function(done) {
      var data1 = {
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret
      };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            'grant_type': 'refresh_token',
            'client_id': clientId,
            'client_secret': clientSecret,
            'refresh_token': refreshToken
          };

          //exchange the refresh token with the access token
          request.post('/oauth2/token')
            .type('form')
            .send(data2)
            .expect(function(res2) {
              assert(res2.body.access_token);
              assert(res2.body.refresh_token);

              assert(res2.body.access_token !== res1.body.access_token);
              assert(res2.body.refresh_token !== res1.body.refresh_token);

              assert.equal(res2.body.scope2, undefined);

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

    it('expired in "ttl" seconds', function(done) {
      var data1 = {
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret
      };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token;

          var data2 = {
            'grant_type': 'refresh_token',
            'client_id': clientId,
            'client_secret': clientSecret,
            'refresh_token': refreshToken
          };

          var timeout = 12 * 1000;
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
                done(err);
              });
          }, timeout);
        })
        .end(function(err, res) {
          assert(!err);
        });
    });

    it('count == 3', function(done) {
      var data1 = {
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret
      };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var refreshToken = res1.body.refresh_token; //the first one

          var data2 = {
            'grant_type': 'refresh_token',
            'client_id': clientId,
            'client_secret': clientSecret
          };

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
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret
      };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var data2 = {
            'grant_type': 'refresh_token',
            'client_id': clientId,
            'client_secret': clientSecret,
            'refresh_token': res1.body.refresh_token
          };

          //Use the same refresh token twice. The second time should fail
          function test() {
            var count = 2;
            return function testRefreshToken() {
              //exchange the refresh token with the access token
              request.post('/oauth2/token')
                .type('form')
                .send(data2)
                .end(function(err, res2) {
                  count--;
                  if (count > 0) {
                    //the access token is successfully received
                    assert(res2.body.access_token);
                    testRefreshToken();
                  }
                  else {
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
          'grant_type': 'client_credentials',
          'client_id': clientId,
          'client_secret': clientSecret
      };

      //request the access token
      request.post('/oauth2/token')
        .type('form')
        .send(data1)
        .expect(function(res1) {
          var data2 = {
            'grant_type': 'refresh_token',
            'client_id': clientId,
            'refresh_token': res1.body.refresh_token
          };

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
                  }
                  else {
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
    it('unregistered client', function(done) {
      done();
    });

    it('token revocation', function(done) {
      done();
    });
  });

});
