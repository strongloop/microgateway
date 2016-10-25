// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var fs = require('fs');
var YAML = require('yamljs');
var path = require('path');
var should = require('should');
var childproc = require('child_process');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;
var ENVPATH = path.resolve(__dirname, '../env.yaml');
var ORIG_ENVFILE = null;
var CHILD_ENV = null;
var child = null;

function envFileStat() {
  try {
    return fs.statSync(ENVPATH);
  } catch (e) {
    return null;
  }
}

function preserveEnvFile() {
  if (!envFileStat()) {
    return;
  }
  ORIG_ENVFILE = path.resolve(__dirname, '../env-' + Math.random());
  fs.renameSync(ENVPATH, ORIG_ENVFILE);
}

function restoreEnvFile() {
  if (!ORIG_ENVFILE) {
    return;
  }
  fs.renameSync(ORIG_ENVFILE, ENVPATH);
}

function writeEnvFile(envobj) {
  var yamlstr = YAML.stringify(envobj);
  fs.writeFileSync(ENVPATH, yamlstr);
}


describe('Setting environment variables', function() {
  var DATASTORE_PORT = 55555;
  var env = {
    PORT: 54321,
    DATASTORE_PORT: 5001,
    APIMANAGER_PORT: 11111,
    APIMANAGER: '127.0.0.1',
    NODE_ENV: 'production' };


  before(function(done) {
    process.env.DATASTORE_PORT = DATASTORE_PORT;
    resetLimiterCache();

    preserveEnvFile();
    writeEnvFile(env);

    child = childproc.fork(path.resolve(__dirname, 'support/env-yaml.child.js'), {
      cwd: path.resolve(__dirname, '../'),
      env: process.env });

    child.on('message', function(msg) {
      CHILD_ENV = msg;
      done();
    });

  });

  after(function() {
    dsCleanupFile();
    child.kill();
    fs.unlinkSync(ENVPATH);
    restoreEnvFile();
    delete process.env.DATASTORE_PORT;
  });

  it('should override defaults where specified', function() {
    should.equal(CHILD_ENV.PORT, env.PORT);
    should.equal(CHILD_ENV.APIMANAGER_PORT, env.APIMANAGER_PORT);
  });

  it('should not override default where not specified', function() {
    should.equal(CHILD_ENV.APIMANAGER_CATALOG, '');
    should.equal(CHILD_ENV.APIMANAGER_REFRESH_INTERVAL, 15 * 1000 * 60);
  });

  it('should add non-defaults', function() {
    should.equal(CHILD_ENV.APIMANAGER, env.APIMANAGER);
  });

  it('should not override explicitly set environment variables', function() {
    should.equal(CHILD_ENV.DATASTORE_PORT, DATASTORE_PORT);
  });
});
