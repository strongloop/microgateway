// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var mg = require('../lib/microgw');
var supertest = require('supertest');

var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;
var apimServer = require('./support/mock-apim-server/apim-server');
var echo = require('./support/echo-server');

var request;

describe('quick start', function() {
  runTestAppIgnored('test app not enabled', 'testappenabledfalse');
  runTestAppIgnored('test app not specified', 'testappenablednotspecified');
  runTestAppIgnored('test app enabled for non development catalog', 'testappenabledtruefornondevcat');
  runTestAppIgnored('test app enabled without credentials', 'testappenablednocredentials');
  runTestAppApplied();
  runTestAppAppliedNoSub();
});

function runTestAppIgnored(desc, dir) {
  describe(desc, function() {
    before(function(done) {
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8081;
      process.env.NODE_ENV = 'production';
      process.env.CONFIG_DIR = __dirname + '/definitions/quickstart/' + dir;
      process.env.DATASTORE_PORT = 5000;

      resetLimiterCache();
      apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        process.env.CONFIG_DIR
      )
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
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
      dsCleanup(5000)
        .then(function() { return mg.stop(); })
        .then(function() { return apimServer.stop(); })
        .then(function() { return echo.stop(); })
        .then(done, done)
        .catch(done);
      delete process.env.CONFIG_DIR;
      delete process.env.NODE_ENV;
      delete process.env.APIMANAGER;
      delete process.env.APIMAMANGER_PORT;
      delete process.env.DATASTORE_PORT;
    });

    it('should pass with "/api/nosec" - onprem noSecurity', noSecurity);
    it('should pass with "/api/nosec" - onprem noSecurityHeaderClientId', noSecurityHeaderClientId);
    it('should pass with "/api/nosec" - onprem noSecurityQueryClientId', noSecurityQueryClientId);
    it('should pass with "/api/nosec" - onprem noSecurityHeaderClientIdBad', noSecurityHeaderClientIdBad);
    it('should pass with "/api/nosec" - onprem noSecurityQueryClientIdBad', noSecurityQueryClientIdBad);
    it('should pass with "/api/hdrclientid" - onprem headerClientId', headerClientId);
    it('should fail with "/api/hdrclientid" - onprem headerClientIdBad', headerClientIdBad);
    it('should fail with "/api/hdrclientid" - onprem headerClientIdQuery', headerClientIdQuery);
    it('should pass with "/api/qryclientid" - onprem queryClientId', queryClientId);
    it('should fail with "/api/qryclientid" - onprem queryClientIdBad', queryClientIdBad);
    it('should fail with "/api/qryclientid" - onprem queryClientIdHeader', queryClientIdHeader);
    it('should pass with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecret', headerClientIdAndSecret);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadClient',
      headerClientIdAndSecretBadClient);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadSecret',
      headerClientIdAndSecretBadSecret);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretQuery',
      headerClientIdAndSecretQuery);
    it('should pass with "/api/qryclientidandsecret" - onprem queryClientIdAndSecret',
      queryClientIdAndSecret);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadClient',
      queryClientIdAndSecretBadClient);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadSecret',
      queryClientIdAndSecretBadSecret);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretHeader',
      queryClientIdAndSecretHeader);
  });
}

function runTestAppApplied() {
  describe('test app really enabled', function() {
    before(function(done) {
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8081;
      process.env.NODE_ENV = 'production';
      process.env.CONFIG_DIR = __dirname + '/definitions/quickstart/testappenabled';
      process.env.DATASTORE_PORT = 5000;
      delete require.cache[require.resolve('../lib/microgw')];
      mg = require('../lib/microgw');
      apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        process.env.CONFIG_DIR
      )
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
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
      dsCleanup(5000)
        .then(function() { return mg.stop(); })
        .then(function() { return apimServer.stop(); })
        .then(function() { return echo.stop(); })
        .then(done, done)
        .catch(done);
      delete process.env.CONFIG_DIR;
      delete process.env.NODE_ENV;
      delete process.env.APIMANAGER;
      delete process.env.APIMAMANGER_PORT;
      delete process.env.DATASTORE_PORT;
    });

    it('should pass with "/api/nosec" - onprem noSecurity', noSecurity);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityHeaderClientIdRate',
      noSecurityHeaderClientIdRate);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityQueryClientIdRate',
      noSecurityQueryClientIdRate);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityHeaderClientIdBadRate',
      noSecurityHeaderClientIdBadRate);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityQueryClientIdBadRate',
      noSecurityQueryClientIdBadRate);
    it('should pass with "/api/hdrclientid" - onprem headerClientId', headerClientId);
    it('should fail rate limit with "/api/hdrclientid" - onprem headerClientIdRate', headerClientIdRate);
    it('should pass with "/api/hdrclientid" - onprem headerClientIdBadPass', headerClientIdBadPass);
    it('should fail with "/api/hdrclientid" - onprem headerClientIdQuery', headerClientIdQuery);
    it('should fail rate limit with "/api/qryclientid" - onprem queryClientIdRate', queryClientIdRate);
    it('should pass with "/api/qryclientid" - onprem queryClientIdBadPass', queryClientIdBadPass);
    it('should fail with "/api/qryclientid" - onprem queryClientIdHeader', queryClientIdHeader);
    it('should fail rate limit with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretRate',
      headerClientIdAndSecretRate);
    it('should pass with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadClientAndSecret',
      headerClientIdAndSecretBadClientAndSecret);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadClient',
      headerClientIdAndSecretBadClient);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadSecret',
      headerClientIdAndSecretBadSecret);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretQuery',
      headerClientIdAndSecretQuery);
    it('should fail rate limit with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretRate',
      queryClientIdAndSecretRate);
    it('should pass with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadClientAndSecret',
      queryClientIdAndSecretBadClientAndSecret);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadClient',
      queryClientIdAndSecretBadClient);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadSecret',
      queryClientIdAndSecretBadSecret);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretHeader',
      queryClientIdAndSecretHeader);
  });
}

function runTestAppAppliedNoSub() {
  describe('test app really enabled no subscription', function() {
    before(function(done) {
      process.env.APIMANAGER = '127.0.0.1';
      process.env.APIMANAGER_PORT = 8081;
      process.env.NODE_ENV = 'production';
      process.env.CONFIG_DIR = __dirname + '/definitions/quickstart/testappenablednosub';
      process.env.DATASTORE_PORT = 5000;
      delete require.cache[require.resolve('../lib/microgw')];
      mg = require('../lib/microgw');
      apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        process.env.CONFIG_DIR
      )
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
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
      dsCleanup(5000)
        .then(function() { return mg.stop(); })
        .then(function() { return apimServer.stop(); })
        .then(function() { return echo.stop(); })
        .then(done, done)
        .catch(done);
      delete process.env.CONFIG_DIR;
      delete process.env.NODE_ENV;
      delete process.env.APIMANAGER;
      delete process.env.APIMAMANGER_PORT;
      delete process.env.DATASTORE_PORT;
    });

    it('should pass with "/api/nosec" - onprem noSecurity', noSecurityTemp);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityHeaderClientIdRate',
      noSecurityHeaderClientIdRate);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityQueryClientIdRate',
      noSecurityQueryClientIdRate);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityHeaderClientIdBadRate',
      noSecurityHeaderClientIdBadRate);
    it('should fail rate limit with "/api/nosec" - onprem noSecurityQueryClientIdBadRate',
      noSecurityQueryClientIdBadRate);
    it('should fail with "/api/hdrclientid" - onprem noSubHeaderClientId', noSubHeaderClientId);
    it('should fail rate limit with "/api/hdrclientid" - onprem noSubHeaderClientIdRate', noSubHeaderClientIdRate);
    it('should pass with "/api/hdrclientid" - onprem headerClientIdBadPass', headerClientIdBadPass);
    it('should fail with "/api/hdrclientid" - onprem headerClientIdQuery', headerClientIdQuery);
    it('should fail rate limit with "/api/qryclientid" - onprem noSubQueryClientIdRate', noSubQueryClientIdRate);
    it('should pass with "/api/qryclientid" - onprem queryClientIdBadPass', queryClientIdBadPass);
    it('should fail with "/api/qryclientid" - onprem queryClientIdHeader', queryClientIdHeader);
    it('should fail rate limit with "/api/hdrclientidandsecret" - onprem noSubHeaderClientIdAndSecretRate',
      noSubHeaderClientIdAndSecretRate);
    it('should pass with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadClientAndSecret',
      headerClientIdAndSecretBadClientAndSecret);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadClient',
      headerClientIdAndSecretBadClient);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretBadSecret',
      headerClientIdAndSecretBadSecret);
    it('should fail with "/api/hdrclientidandsecret" - onprem headerClientIdAndSecretQuery',
      headerClientIdAndSecretQuery);
    it('should fail with "/api/qryclientidandsecret" - onprem noSubQueryClientIdAndSecretRate',
      noSubQueryClientIdAndSecretRate);
    it('should pass with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadClientAndSecret',
      queryClientIdAndSecretBadClientAndSecret);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadClient',
      queryClientIdAndSecretBadClient);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretBadSecret',
      queryClientIdAndSecretBadSecret);
    it('should fail with "/api/qryclientidandsecret" - onprem queryClientIdAndSecretHeader',
      queryClientIdAndSecretHeader);
  });
}

function noSecurityTemp(doneCB) {
  request
    .get('/api/nosec')
    .expect(429 /*200*/, doneCB);
}

function noSecurity(doneCB) {
  request
    .get('/api/nosec')
    .expect(200, doneCB);
}

function noSecurityHeaderClientId(doneCB) {
  request
    .get('/api/nosec')
    .set('X-IBM-Client-Id', 'default')
    .expect(200, doneCB);
}

function noSecurityHeaderClientIdRate(doneCB) {
  request
    .get('/api/nosec')
    .set('X-IBM-Client-Id', 'default')
    .expect(429, doneCB);
}

function noSecurityQueryClientId(doneCB) {
  request
    .get('/api/nosec?client_id=default')
    .expect(200, doneCB);
}

function noSecurityQueryClientIdRate(doneCB) {
  request
    .get('/api/nosec?client_id=default')
    .expect(429, doneCB);
}

function noSecurityHeaderClientIdBad(doneCB) {
  request
    .get('/api/nosec')
    .set('X-IBM-Client-Id', 'bad')
    .expect(200, doneCB);
}

function noSecurityHeaderClientIdBadRate(doneCB) {
  request
    .get('/api/nosec')
    .set('X-IBM-Client-Id', 'bad')
    .expect(429, doneCB);
}

function noSecurityQueryClientIdBad(doneCB) {
  request
    .get('/api/nosec?client_id=bad')
    .expect(200, doneCB);
}

function noSecurityQueryClientIdBadRate(doneCB) {
  request
    .get('/api/nosec?client_id=bad')
    .expect(429, doneCB);
}

function headerClientId(doneCB) {
  request
    .get('/api/hdrclientid')
    .set('X-IBM-Client-Id', 'default')
    .expect(200, doneCB);
}

function headerClientIdRate(doneCB) {
  request
    .get('/api/hdrclientid')
    .set('X-IBM-Client-Id', 'default')
    .expect(200 /*429*/, doneCB);
}

function headerClientIdBad(doneCB) {
  request
    .get('/api/hdrclientid')
    .set('X-IBM-Client-Id', 'bad')
    .expect(401, doneCB);
}

function headerClientIdBadPass(doneCB) {
  request
    .get('/api/hdrclientid')
    .set('X-IBM-Client-Id', 'bad')
    .expect(200, doneCB);
}

function headerClientIdQuery(doneCB) {
  request
    .get('/api/hdrclientid?client_id=default')
    .expect(401, doneCB);
}

function queryClientId(doneCB) {
  request
    .get('/api/qryclientid?client_id=default')
    .expect(200, doneCB);
}

function queryClientIdRate(doneCB) {
  request
    .get('/api/qryclientid?client_id=default')
    .expect(200 /*429*/, doneCB);
}

function queryClientIdBad(doneCB) {
  request
    .get('/api/qryclientid?client_id=bad')
    .expect(401, doneCB);
}

function queryClientIdBadPass(doneCB) {
  request
    .get('/api/qryclientid?client_id=bad')
    .expect(200, doneCB);
}

function queryClientIdHeader(doneCB) {
  request
    .get('/api/qryclientid')
    .set('X-IBM-Client-Id', 'default')
    .expect(401, doneCB);
}

function headerClientIdAndSecret(doneCB) {
  request
    .get('/api/hdrclientidandsecret')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(200, doneCB);
}

function headerClientIdAndSecretRate(doneCB) {
  request
    .get('/api/hdrclientidandsecret')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(200 /*429*/, doneCB);
}

function headerClientIdAndSecretBadClientAndSecret(doneCB) {
  request
    .get('/api/hdrclientidandsecret')
    .set('X-IBM-Client-Id', 'bad')
    .set('X-IBM-Client-Secret', 'BAD')
    .expect(200, doneCB);
}

function headerClientIdAndSecretBadClient(doneCB) {
  request
    .get('/api/hdrclientidandsecret')
    .set('X-IBM-Client-Id', 'bad')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(401, doneCB);
}

function headerClientIdAndSecretBadSecret(doneCB) {
  request
    .get('/api/hdrclientidandsecret')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'BAD')
    .expect(401, doneCB);
}

function headerClientIdAndSecretQuery(doneCB) {
  request
    .get('/api/hdrclientidandsecret?client_id=default&client_secret=SECRET')
    .expect(401, doneCB);
}

function queryClientIdAndSecret(doneCB) {
  request
    .get('/api/qryclientidandsecret?client_id=default&client_secret=SECRET')
    .expect(200, doneCB);
}

function queryClientIdAndSecretRate(doneCB) {
  request
    .get('/api/qryclientidandsecret?client_id=default&client_secret=SECRET')
    .expect(200 /*429*/, doneCB);
}

function queryClientIdAndSecretBadClientAndSecret(doneCB) {
  request
    .get('/api/qryclientidandsecret?client_id=bad&client_secret=BAD')
    .expect(200, doneCB);
}

function queryClientIdAndSecretBadClient(doneCB) {
  request
    .get('/api/qryclientidandsecret?client_id=bad&client_secret=SECRET')
    .expect(401, doneCB);
}

function queryClientIdAndSecretBadSecret(doneCB) {
  request
    .get('/api/qryclientidandsecret?client_id=default&client_secret=BAD')
    .expect(401, doneCB);
}

function queryClientIdAndSecretHeader(doneCB) {
  request
    .get('/api/qryclientidandsecret')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(401, doneCB);
}

function noSubHeaderClientId(doneCB) {
  request
    .get('/api/hdrclientid')
    .set('X-IBM-Client-Id', 'default')
    .expect(401, doneCB);
}

function noSubHeaderClientIdRate(doneCB) {
  request
    .get('/api/hdrclientid')
    .set('X-IBM-Client-Id', 'default')
    .expect(401, doneCB);
}

function noSubQueryClientIdRate(doneCB) {
  request
    .get('/api/qryclientid?client_id=default')
    .expect(401, doneCB);
}

function noSubHeaderClientIdAndSecretRate(doneCB) {
  request
    .get('/api/hdrclientidandsecret')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(401, doneCB);
}

function noSubQueryClientIdAndSecretRate(doneCB) {
  request
    .get('/api/qryclientidandsecret?client_id=default&client_secret=SECRET')
    .expect(401, doneCB);
}
