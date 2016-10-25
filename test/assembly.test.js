// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var assert = require('assert');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('preflow and flow-engine integration', function() {

  // using the config/default configuration files
  describe('test using default configuration', function() {
    var request;
    before(function(done) {
      process.env.CONFIG_DIR = __dirname + '/definitions/default';
      process.env.APIMANAGER = '127.0.0.1';
      process.env.NODE_ENV = 'production';

      resetLimiterCache();
      mg.start(3000)
        .then(function() { return echo.start(8889); })
        .then(function() {
          request = supertest('http://localhost:3000');
        })
        .then(done)
        .catch(function(err) {
          console.error(err);
          done(err);
        });
    });

    after(function(done) {
      dsCleanupFile();
      delete process.env.CONFIG_DIR;
      delete process.env.APIMANAGER;
      delete process.env.NODE_ENV;
      echo.stop()
        .then(function() { return mg.stop(); })
        .then(done, done);
    });


    var clientId1 = 'fb82cb59-ba95-4c34-8612-e63697d7b845';
    it('client_id=' + clientId1 + ' (query) should invoke API1 (apim-lookup) active=true, state=ACTIVE',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId1)
        .expect(200, '/api1', done);
      });

    var clientId101 = 'fb82cb59-ba95-4c34-8612-e63697d7b84501';
    it('client_id=' + clientId101 + ' (query) should invoke API1 (apim-lookup) active=false, state=ACTIVE',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId101)
        .expect(401, done);
      });

    var clientId102 = 'fb82cb59-ba95-4c34-8612-e63697d7b84502';
    it('client_id=' + clientId102 + ' (query) should invoke API1 (apim-lookup) active=undefined, state=ACTIVE',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId102)
        .expect(200, '/api1', done);
      });

    var clientId103 = 'fb82cb59-ba95-4c34-8612-e63697d7b84503';
    it('client_id=' + clientId103 + ' (query) should invoke API1 (apim-lookup) active=true, state=SUSPENDED',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId103)
        .expect(401, done);
      });

    var clientId104 = 'fb82cb59-ba95-4c34-8612-e63697d7b84504';
    it('client_id=' + clientId104 + ' (query) should invoke API1 (apim-lookup) active=false, state=SUSPENDED',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId104)
        .expect(401, done);
      });

    var clientId105 = 'fb82cb59-ba95-4c34-8612-e63697d7b84505';
    it('client_id=' + clientId105 + ' (query) should invoke API1 (apim-lookup) active=undefined, state=SUSPENDED',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId105)
        .expect(401, done);
      });

    var clientId106 = 'fb82cb59-ba95-4c34-8612-e63697d7b84506';
    it('client_id=' + clientId106 + ' (query) should invoke API1 (apim-lookup) active=true, state=undefined',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId106)
        .expect(200, '/api1', done);
      });

    var clientId107 = 'fb82cb59-ba95-4c34-8612-e63697d7b84507';
    it('client_id=' + clientId107 + ' (query) should invoke API1 (apim-lookup) active=false, state=undefined',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId107)
        .expect(401, done);
      });

    var clientId108 = 'fb82cb59-ba95-4c34-8612-e63697d7b84508';
    it('client_id=' + clientId108 + ' (query) should invoke API1 (apim-lookup) active=undefined, state=undefined',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientId108)
        .expect(200, '/api1', done);
      });

    var clientId2 = '612caa59-9649-491f-99b7-d9a941c4bd2e';
    it('client_id=' + clientId2 + ' (query) should invoke API2 (apim-lookup)',
      function(done) {
        request
        .get('/v1/forecasts?client_id=' + clientId2)
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId2 +
      ' (query) should invoke API2 (apim-lookup-defaultcat)',
      function(done) {
        request
        .get('/v1/forecasts?client_id=' + clientId2)
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad org (apim-lookup)',
      function(done) {
        request
        .get('/xyz/sb/v1/ascents?client_id=' + clientId1)
        .expect(404, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad catalog (apim-lookup)',
      function(done) {
        request
        .get('/xyz/v1/ascents?client_id=' + clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad base path (apim-lookup)',
      function(done) {
        request
        .get('/xyz/ascents?client_id=' + clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad path (apim-lookup)',
      function(done) {
        request
        .get('/v1/xyz?client_id=' + clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    var clientIdBad = '612caa59-9649-491f-99b7-d9a941c4bd2f';
    it('client_id=' + clientIdBad +
      ' (query) should not find api - bad clientId (apim-lookup)',
      function(done) {
        request
        .get('/v1/ascents?client_id=' + clientIdBad)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (query) should not find api - bad clientId name (apim-lookup)',
      function(done) {
        request
        .get('/v1/ascents?client-id=' + clientIdBad)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    var clientSecret3a = 'api-level_secret';
    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (query) should invoke API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a)
        .expect(200, '/api3', done);
      });

    var clientSecret3Bad = 'bad_secret';
    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3Bad + '(query) should not find api -' +
      ' bad secret (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3Bad)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 +
      ' (query) should not find api - missing secret (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?client_id=' + clientId2)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3a + '(query) should not find api -' +
      ' bad clientID valid secret (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?client_id=' + clientIdBad +
          '&client_secret=' + clientSecret3a)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + '(query) should not find api -' +
      ' bad secret name (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret_bad=' + clientSecret3a)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 + ' secret=' + clientSecret3a +
      ' (query) should invoke API3 with extra parm (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a +
          '&extra_parm=someValue')
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId1 + ' (header) should invoke API1 (apim-lookup)',
      function(done) {
        request
        .get('/v1/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(200, '/api1', done);
      });

    it('client_id=' + clientId2 + ' (header) should invoke API2 (apim-lookup)',
      function(done) {
        request
        .get('/v1/forecasts')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId2 +
      ' (header) should invoke API2 (apim-lookup-defaultcat)',
      function(done) {
        request
        .get('/v1/forecasts')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        // .set('x-ibm-plan-version', '2.0')
        .expect(200, '/api2', done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad org (apim-lookup)',
      function(done) {
        request
        .get('/xyz/sb/v1/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad catalog (apim-lookup)',
      function(done) {
        request
        .get('/apim/xyz/v1/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientIdBad +
      ' (header) should not find api - bad clientId (apim-lookup)',
      function(done) {
        request
        .get('/v1/ascents')
        .set('X-IBM-Client-Id', clientIdBad)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad base path (apim-lookup)',
      function(done) {
        request
        .get('/xyz/ascents')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad path (apim-lookup)',
      function(done) {
        request
        .get('/v1/xyz')
        .set('X-IBM-Client-Id', clientId1)
        .expect(404, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId1 +
      ' (header) should not find api - bad clientID name (apim-lookup)',
      function(done) {
        request
        .get('/v1/ascents')
        .set('X-IBM-Client-Id-bad', clientId1)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (header) should invoke API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret', clientSecret3a)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3Bad + '(header) should not find api -' +
      ' bad secret (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret', clientSecret3Bad)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 +
      ' (header) should not find api - missing secret (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3a + '(header) should not find api -' +
      ' bad clientID valid secret (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes?')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientIdBad)
        .set('X-IBM-Client-Secret', clientSecret3a)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + '(header) should not find api -' +
      ' bad secret name (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret-Bad', clientSecret3a)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 + ' secret=' + clientSecret3a +
      ' (header) should invoke API3 with extra parm (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .set('X-IBM-Client-Secret', clientSecret3a)
        .set('extra_parm', 'someValue')
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (header) should invoke API3 -' +
      ' key only (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test1')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a + ' (query) should fail -' +
      ' no query at operation (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test1?client_id=' + clientId2 +
          '&client_secret=' + clientSecret3a)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3Bad + ' (header) should invoke API3 -' +
      ' no requirements (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test2')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientIdBad)
        .set('X-IBM-Client-Secret', clientSecret3Bad)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3Bad + ' (header) should invoke API3 -' +
      ' bad names/values no requirements (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test2')
        .set('x-ibm-plan-id-bad', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id-bad', clientId2)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' (query) should invoke API3 - last req (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test3?client_id=' + clientId2)
        .expect(200, '/api3', done);
      });

    it('client_secret=' + clientSecret3a +
      ' (header) should invoke API3 - first req (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test3')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Secret', clientSecret3a)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' (header) should not find api - missing req (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test3')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(401, done);
      });

    it('client_secret=' + clientSecret3a +
      ' (header) should invoke API3 - first scheme (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test3')
        .set('x-ibm-plan-id', 'apim:1.0.0:gold')
        .set('X-IBM-Client-Id', clientId2)
        .expect(401, { name: 'PreFlowError', message: 'unable to process the request' }, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a +
      ' (query) arbitrary id should invoke API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test5?myQueryId=' + clientId2)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a +
      ' (header) arbitrary id should invoke API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test5')
        .set('myHeaderId', clientId2)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a +
      ' (query) arbitrary id/secret should invoke API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6?myQueryId=' + clientId2 +
          '&myQuerySecret=' + clientSecret3a)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3a +
      ' (header) arbitrary id/secret should invoke API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6')
        .set('myHeaderId', clientId2)
        .set('myHeaderSecret', clientSecret3a)
        .expect(200, '/api3', done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3a +
      ' (query) arbitrary id/secret invalid client ID value should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6?myQueryId=' + clientIdBad +
          '&myQuerySecret=' + clientSecret3a)
        .expect(401, done);
      });

    it('client_id=' + clientIdBad +
      ' secret=' + clientSecret3a +
      ' (header) arbitrary id/secret invalid client ID value should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6')
        .set('myHeaderId', clientIdBad)
        .set('myHeaderSecret', clientSecret3a)
        .expect(401, done);
      });

    var clientIdBadName = 'BadName';
    it(clientIdBadName + '=' + clientId2 +
      ' secret=' + clientSecret3a +
      ' (query) arbitrary id/secret invalid client ID name should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6?' + clientIdBadName + '=' + clientId2 +
          '&myQuerySecret=' + clientSecret3a)
        .expect(401, done);
      });

    it(clientIdBadName + clientId2 +
      ' secret=' + clientSecret3a +
      ' (header) arbitrary id/secret invalid client ID name should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6')
        .set(clientIdBadName, clientId2)
        .set('myHeaderSecret', clientSecret3a)
        .expect(401, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3Bad +
      ' (query) arbitrary id/secret invalid client secret value should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6?myQueryId=' + clientId2 +
          '&myQuerySecret=' + clientSecret3Bad)
        .expect(401, done);
      });

    it('client_id=' + clientId2 +
      ' secret=' + clientSecret3Bad +
      ' (header) arbitrary id/secret invalid client secret value should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6')
        .set('myHeaderId', clientId2)
        .set('myHeaderSecret', clientSecret3Bad)
        .expect(401, done);
      });

    var clientSecretBadName = 'BadName';
    it(clientIdBadName + '=' + clientId2 +
      ' ' + clientSecretBadName + '=' + clientSecret3a +
      ' (query) arbitrary id/secret invalid client secret name should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6?myQueryId=' + clientId2 +
          '&' + clientSecretBadName + '=' + clientSecret3a)
        .expect(401, done);
      });

    it(clientIdBadName + clientId2 +
      ' ' + clientSecretBadName + '=' + clientSecret3a +
      ' (header) arbitrary id/secret invalid client secret name should fail API3 (apim-lookup)',
      function(done) {
        request
        .get('/v1/routes/test6')
        .set('myHeaderId', clientId2)
        .set(clientSecretBadName, clientSecret3a)
        .expect(401, done);
      });

      /*
       it('should execute invoke-api POST', function(done) {
       request
       .post('/apim/test')
       .field('client_id', '123098456765')
       .send('hello')
       .expect(200, 'hello', done);
       });
       */
  }); // end of 'test using default configuration' test block


  // using the test/definitions/assembly configuration files
  describe('test using test/assembly configuration', function() {
    var request;
    before(function(done) {
      process.env.CONFIG_DIR = __dirname + '/definitions/assembly';
      mg.start(3001)
        .then(function() {
          request = supertest('http://localhost:3001');
        })
        .then(done)
        .catch(function(err) {
          console.error(err);
          done(err);
        });
    });

    after(function(done) {
      dsCleanupFile();
      mg.stop()
        .then(done, done)
        .catch(done);
      delete process.env.CONFIG_DIR;
    });

    it('use not-existing policy should return error', function(done) {
      request
        .get('/v1/assembly/policy-not-found')
        .expect(500, done);
    });

    it('empty basepath should be successful', function(done) {
      request
        .get('/yosemite')
        .expect(200, done);
    });

    it('root path should be successful', function(done) {
      request
        .get('/v2')
        .expect(200, done);
    });

    describe('should inject X-Powered-By header', function() {
      var headerName = 'X-Powered-By';
      var expectedValue = 'IBM API Connect MicroGateway';
      var payload = { hello: 'world' };

      it('when request is processed', function(done) {
        request
          .post('/v1/assembly/identity')
          .type('json')
          .send(payload)
          .expect(headerName, expectedValue)
          .expect(200, payload, done);
      });

      it('when request is rejected', function(done) {
        request
          .post('/v1/assembly/identity')
          .type('json')
          .send(':' + JSON.stringify(payload))
          .expect(headerName, expectedValue)
          .expect(400, done);
      });
    });

    describe('should be able to send large response payload', function() {
      var payloadSize = [ 256, 1024, 2048, 4096 ];
      payloadSize.forEach(function(size) {
        it('' + size + 'kb response payload should work', function(done) {
          size = size * 1000;
          request
            .get('/v1/assembly/large-payload?size=' + size)
            .expect(function(res) {
              assert.strictEqual(res.body.value.length, size);
            })
            .end(done);
        });
      });
    });

    describe('should process large request payloads', function() {
      var payloadLimit = 4096000;
      var payloadSize = [ 1024000, 4096000, 4096001, 5120000 ];

      payloadSize.forEach(function(size) {
        var testCaseName = (size <= payloadLimit) ? 'accept' : 'reject';
        testCaseName += ' ' + (size / 1000) + 'KB request payload';
        it(testCaseName, function(done) {
          var payload = (new Buffer(size).fill('#')).toString();
          if (size <= payloadLimit) {
            request
              .post('/v1/assembly/identity')
              .type('text')
              .send(payload)
              .expect(200, payload, done);
          } else {
            request
              .post('/v1/assembly/identity')
              .type('text')
              .send(payload)
              .expect(function(res) {
                assert.strictEqual(res.status, 413);

                // check if error has been masked (not expose to much from server)
                delete res.body.name;
                delete res.body.message;
                assert(_.isEmpty(res.body));
              })
              .end(done);
          }
        });
      });
    });

  });  // end of 'test using test/assembly configuration' test block

});
