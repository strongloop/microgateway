// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

//This env has to be before the mg require because policy loader runs early
process.env.POLICY_DIR = __dirname + '/definitions/policy-loader/location3';
var mg = require('../lib/microgw');
var supertest = require('supertest');
var _ = require('lodash');
var assert = require('assert');
var apimServer = require('./support/mock-apim-server/apim-server');

var request, httprequest;

function dsCleanup(port) {
  // clean up the directory
  return new Promise(function(resolve, reject) {
    var expect = {snapshot : {}};
    var datastoreRequest = supertest('http://localhost:' + port);
    datastoreRequest
      .get('/api/snapshots')
      .end(function (err, res) {
        var snapshotID = res.body[0].id;
        datastoreRequest
          .get('/api/snapshots/release?id=' + snapshotID)
          .end(function(err, res) {
            try {
              assert(_.isEqual(expect, res.body));
              resolve();
            } catch (error) {
              reject(error);
            }
          });
      });
  });
}

describe('policy loader version support test', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/policy-loader';
    process.env.NODE_ENV = 'production';
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
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.POLICY_DIR;
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it.skip('ver-test-policy:1.0.0 should pass', version100);
  it.skip('ver-test-policy:1.0.1 should pass', version101);
  it.skip('ver-test-policy (Default) should resolve to 1.0.1', versionDefault);
  it.skip('ver-test-policy:1.0.0 and 1.0.1 should pass', version100and101);
  it.skip('ver-test-policy:1.0.0 and (Default) should pass', version100andDefault);
  it.skip('ver-test-policy:1.0.1 and (Default) should pass (same policy 2x)', version101andDefault);
  it.skip('ver-test-policy:1.0.2 should fail (module not found)', versionMissing);
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
