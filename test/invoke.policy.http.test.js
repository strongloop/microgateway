'use strict';

var _ = require('lodash');
var assert = require('assert');
var supertest = require('supertest');
var microgw = require('../lib/microgw');
var backend = require('./support/invoke-server');
var apimServer = require('./support/mock-apim-server/apim-server');

describe('invokePolicy', function() {

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
            __dirname + '/definitions/invoke')
        .then(function() { return microgw.start(3000); })
        .then(function() { return backend.start(8889); })
        .then(function() {
            request = supertest('http://localhost:3000');
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
      .then(function() { return backend.stop(); })
      .then(done, done)
      .catch(done);
  });

  var data = { msg: 'Hello world' };

  //invoke policy to post a request
  it('post', function(done) {
    this.timeout(10000);

    //by default, chunk-uploaded is false
    request
      .post('/invoke/basic')
      .send(data)
      .expect(/z-method: POST/)
      .expect(/z-content-length: 21/)
      .expect(/z-transfer-encoding: undefined/)
      .expect(200, /z-url: \/\/invoke\/basic/)
      .end(function(err, res) {
          done(err);
      });
  });

  //This testcase is to verify the invoke policy will urlencode the form data
  //before sending them to the api server
  it('form-urlencoded-1', function(done) {
    this.timeout(10000);

  //POST application/x-www-form-urlencoded
    request
      .post('/invoke/encode')
      .type('form')
      .send({ foo: 'hello' })
      .send({ bar: 123 })
      .send({ baz: ['qux', 'quux' ]})
      .expect(/z-method: POST/)
      .expect(/z-content-type: application\/x-www-form-urlencoded/)
      .expect(200, /body: foo=hello&bar=123&baz%5B0%5D=qux&baz%5B1%5D=quux/)
                        //foo=hello&bar=123&baz[0]=qux&baz[1]=quux
      .end(function(err, res) {
          done(err);
      });
  });

  //This testcase is to verify the invoke policy will parse the urlencoded data
  //after receiving them from the api server
  it('form-urlencoded-2', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/decode')
      .expect('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200, /Found the parameter 'baz'=qux,quux in the message.body/)
      .end(function(err, res) {
          done(err);
      });
  });

  //This testcase is to verify the post-flow should urlencode the message.body
  //when the content-type is x-www-form-urlencoded
  it('post-flow-should-urlencode-the-form-data', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/decode')
      .set('X-TEST-POSTFLOW', 'yes')
      .expect('Content-Type', 'application/x-www-form-urlencoded')
      .expect(200, /^foo=bar&baz%5B0%5D=qux&baz%5B1%5D=quux&corge=$/)
      .end(function(err, res) {
          done(err);
      });
  });

  it('get', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/basic')
      .expect(200, /z-method: GET/)
      .expect(200, /z-url: \/\/invoke\/basic/, done);
  });

  //a HEAD response has no body
  it('head', function(done) {
    this.timeout(10000);

    request
      .head('/invoke/basic')
      .expect(200, /^$/, done);
  });

  //the target-url contains an invalid host name
  it('host-not-found', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/dynHost')
      .set('X-TEST-HOSTNAME', 'cannot.be.valid.com')
      .expect(299, /'ConnectionError' Error: getaddrinfo ENOTFOUND/, done);
  });

  //the invoke policy receives a 500 error from the server
  it('test-500-rror', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/test500Error')
      .expect(500, /This is a test for 500 error/, done);
  });

  it('auth-OK', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/basic')
      .auth('root', 'Hunter2')
      .expect(200, /z-method: GET/, done);
  });

  it('auth-NG', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/basic')
      .auth('root', 'test123')
      .expect(401, /^Not Authorized/, done);
  });

  it('compress-data', function(done) {
    this.timeout(10000);

    //when data is compressed, use the chunked encoding
    request
      .post('/invoke/testCompression')
      .set('X-RAW-DATA', 'Hello World')
      .expect(/z-content-encoding: gzip/)
      .expect(/z-content-length: undefined/)
      .expect(/z-transfer-encoding: chunked/)
      .expect(/raw: H4sIAAAAAAAAA\/NIzcnJVwjPL8pJAQBWsRdKCwAAAA==/)
      .expect(200, /body: Hello World/, done);
  });

  it('use-chunks-yes', function(done) {
    this.timeout(10000);

    request
      .post('/invoke/useChunks')
      .send(data)
      .expect(/z-content-encoding: undefined/)
      .expect(/z-content-length: undefined/)
      .expect(/z-transfer-encoding: chunked/)
      .expect(200, /{"msg":"Hello world"}/, done);
  });

  it('just-in-time', function(done) {
    this.timeout(10000);

    //request returned before timeout
    request
      .get('/invoke/timeout5Sec')
      .set('X-DELAY-ME', '2')
      .expect(200, /z-url: \/\/invoke\/timeout5Sec/, done);
  });

  it('request-timeouted', function(done) {
    this.timeout(10000);

    //the request timeouted
    request
      .get('/invoke/timeout5Sec')
      .set('X-DELAY-ME', '7')
      .expect(299, /The invoke policy is timeouted./, done);
  });

  /////////////////////// HTTPS servers ///////////////////////
  //8890: The server is "Sarah", whose CA is root
  //8891: The server is "Sandy", whose CA is root2
  //8892: The server is using TLS10, "ProtocolTLS10"
  //8893: The server uses only some ciphers, "LimitedCiphers"
  //8894: The server uses alice and bob as the CA. Incorrect usage?
  //8895: 'Sarah' uses the CA 'root' to authenticate clients
  //8896: 'Sarah' uses the CA 'root2' to authenticate clients
  //8897: 'Sandy' uses the CA 'root2' to authenticate clients
  /////////////////////////////////////////////////////////////

  //This is to test if client can skip the validation of server's certificate.
  //By default, no. To allow it, put the following line in the invoke/index.js.
  //process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  it('https-basic', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8890')
      .set('X-TLS-PROFILE', 'tls-profile-simple')
      .expect(299, /unable to verify the first certificate/, done);
  });

  //Use the certificate of Sarah's Root CA to authenticate the Sarah. OK
  //Note: the common name of Sarah must be domain name or localhost. Otherwise,
  //You might get an error "Host: localhost. is not cert\'s CN: Sarah".
  it('https-server-sarah-OK', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8890')
      .set('X-TLS-PROFILE', 'tls-profile-serverSarah-1')
      .expect(/url: \/\/invoke\/testTLS/)
      .expect(200, done)
  });

  //Use Sarah's own certificate to authenticate Sarah. NG
  it('https-server-sarah-NG', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8890')
      .set('X-TLS-PROFILE', 'tls-profile-serverSarah-2')
      .expect(299, /unable to verify the first certificate/, done);
  });

  it('cannot-find-tls-profile', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8890')
      .set('X-TLS-PROFILE', 'not-found')
      .expect(299, /Cannot find the TLS profile "not-found"/, done);
  });

  //openssl s_client -tls1_2 -CAfile root.crt -connect localhost:port
  //openssl s_client -tls1 -CAfile root.crt -connect localhost:port
  //Both of server and client use the TLS v1.0
  it('require-tls10', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8892')
      .set('X-TLS-PROFILE', 'tls-profile-require-tls10')
      .expect(/url: \/\/invoke\/testTLS/)
      .expect(200, done);
  });

  it('require-tls12-while-server-supports-tls10', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8892')
      .set('X-TLS-PROFILE', 'tls-profile-require-tls12')
      .expect(299, /Error: write EPROTO/, done);
  });

  //cipher mapping table for each TLS versions:
  //https://www.openssl.org/docs/manmaster/apps/ciphers.html#CIPHER_LIST_FORMAT
  //both of server and client support the cipher 'TLS_RSA_WITH_3DES_EDE_CBC_SHA'
  it('use-cipher-TLS_RSA_WITH_3DES_EDE_CBC_SHA', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8892')
      .set('X-TLS-PROFILE', 'use-cipher-TLS_RSA_WITH_3DES_EDE_CBC_SHA')
      .expect(200, done);
  });

  //client requires a cipher which is disalloed by server
  //The EPROTO error is due to the "!ECDHE-RSA-AES128-SHA256" in server side.
  //The cipher is available but is not allowed.
  it('use-cipher-TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8893')
      .set('X-TLS-PROFILE', 'use-cipher-TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256')
      .expect(299, /Error: write EPROTO/, done);
  });

  /*
  Disable the PSK cipher
  //'no ciphers available' or 'write EPROTO'?
  it('use-cipher-PSK_WITH_CAMELLIA_128_CBC_SHA256', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8893')
      .set('X-TLS-PROFILE', 'use-cipher-PSK_WITH_CAMELLIA_128_CBC_SHA256')
      .expect(299, /SSL23_CLIENT_HELLO:no ciphers available/, done);
  });
  */

  //The client expects the server to be Sarah and uses the CA 'root' for auth.
  //However, the server is Sandy who should be authenticated using 'root2'.
  it('unpexected-https-server', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8891')
      .set('X-TLS-PROFILE', 'tls-profile-serverSarah-1')
      .expect(299, /unable to verify the first certificate/, done);
  });

  //'sarah' at 8895 is authenticated by 'root' and uses 'root' to authenticate
  //its client too. So both of 'alice' and 'bob' will be good
  it('mutual-auth-ok', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8895')
      .set('X-TLS-PROFILE', 'tls-profile-alice-2')
      .expect(/url: \/\/invoke\/testTLS/)
      .expect(200, done);
  });

  it('mutual-auth-ok-2', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8895')
      .set('X-TLS-PROFILE', 'tls-profile-bob-2')
      .expect(/url: \/\/invoke\/testTLS/)
      .expect(200, done);
  });

  it('mutual-auth-ng', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8895')
      .set('X-TLS-PROFILE', 'tls-profile-sandy-2')
      .expect(299, /Error: socket hang up/, done);
  });

  //'sarah' at 8896 is authenticated by 'root' and uses 'root2' to authenticate
  //its client too. So only 'sandy' will be good
  it('mutual-auth-ok-3', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8896')
      .set('X-TLS-PROFILE', 'tls-profile-sandy-2')
      .expect(/url: \/\/invoke\/testTLS/)
      .expect(200, done);
  });

  it('mutual-auth-ng-2', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8896')
      .set('X-TLS-PROFILE', 'tls-profile-bob-2')
      .expect(299, /Error: socket hang up/, done);
  });

  //'sandy' at 8897 is authenticated by 'root2' and uses 'root2' to authenticate
  //its client too. Son only 'sandy' will be good
  it('mutual-auth-ok-4', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8897')
      .set('X-TLS-PROFILE', 'tls-profile-sandy-2')
      .expect(/url: \/\/invoke\/testTLS/)
      .expect(200, done);
  });

  it('mutual-auth-ng-3', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testTLS')
      .set('X-HTTPS-PORT', '8897')
      .set('X-TLS-PROFILE', 'tls-profile-alice-2')
      .expect(299, /Error: socket hang up/, done);
  });

  //to read the data and headers from somewhere other than the context.message
  it('test-input', function(done) {
    this.timeout(10000);

    request
      .post('/invoke/testInput')
      .send(data)
      .expect(/z-method: POST/)
      .expect(/z-secret-1: test 123/)
      .expect(/z-secret-2: hello amigo/)
      .expect(200, /body: This is a custom body message/, done);
  });

  //to save the result of invoke policy somewhere other than the context.message
  it('test-output', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testOutput')
      .expect('X-TOKEN-ID', 'foo')
      .expect(202, /You are accepted/, done);
  });

  //The api server returns a message of length 5 and header 'Content-Length:5'.
  //Then a set-variable policy modifies the message without changing the
  //Content-Length. Let's see what'll happen.
  //It turns out that express will update the Content-Length
  it('test-content-length', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testContentLength')
      .expect('Content-Length', 95)
      .expect(200, /This is a very long message/, done);
  });

  //the returned body might be parsed as JSON depending on the content-type
  it('test-json', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/testJSON')
      .expect(200, /The quantity is 150 and the price is 23/, done);
  });

  it('cleanup snapshots directory',
    function(done) {
      var expect = {snapshot : {}};
      datastoreRequest
        .get('/api/snapshots')
        .end(function (err, res) {
          var snapshotID = res.body[0].id;
          console.log(snapshotID);
          datastoreRequest.get('/api/snapshots/release?id=' + snapshotID)
            .expect(function(res) {
              assert(_.isEqual(expect, res.body)); 
            }
          ).end(done)
        });
    }
  );
});
