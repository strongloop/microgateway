// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var mg;
var supertest = require('supertest');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

var request;

describe('policy loader version support test', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/policy-loader';
    process.env.NODE_ENV = 'production';
    process.env.POLICY_DIR = __dirname + '/definitions/policy-loader/location3';

    resetLimiterCache();

    delete require.cache[require.resolve('../lib/microgw')];
    mg = require('../lib/microgw');
    mg.start(3000)
      .then(function() {
        request = supertest(mg.app);
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
    delete process.env.POLICY_DIR;
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('ver-test-policy:1.0.0 should pass', version100);
  it('ver-test-policy:1.0.1 should pass', version101);
  it('ver-test-policy (Default) should resolve to 1.0.1', versionDefault);
  it('ver-test-policy:1.0.0 and 1.0.1 should pass', version100and101);
  it('ver-test-policy:1.0.0 and (Default) should pass', version100andDefault);
  it('ver-test-policy:1.0.1 and (Default) should pass (same policy 2x)', version101andDefault);
  it('ver-test-policy:1.0.2 should fail (module not found)', versionMissing);
});

function version100(doneCB) {
  request
    .get('/policyloader/ver100')
    .expect('x-policy-100', 'true')
    .expect(200, doneCB);
}

function version101(doneCB) {
  request
    .get('/policyloader/ver101')
    .expect('x-policy-101', 'true')
    .expect(200, doneCB);
}

function versionDefault(doneCB) {
  request
    .get('/policyloader/verDefault')
    .expect('x-policy-101', 'true')
    .expect(200, doneCB);
}

function version100and101(doneCB) {
  request
    .get('/policyloader/ver100and101')
    .expect('x-policy-100', 'true')
    .expect('x-policy-101', 'true')
    .expect(200, doneCB);
}

function version100andDefault(doneCB) {
  request
    .get('/policyloader/ver100andDefault')
    .expect('x-policy-100', 'true')
    .expect('x-policy-101', 'true')
    .expect(200, doneCB);
}

function version101andDefault(doneCB) {
  request
    .get('/policyloader/ver101andDefault')
    .expect('x-policy-101', 'true')
    .expect(200, doneCB);
}

function versionMissing(doneCB) {
  request
    .get('/policyloader/verMissing')
    .expect(500, doneCB);
}
