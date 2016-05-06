// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var mg = require('../lib/microgw');
var supertest = require('supertest');

var request;

describe('preflow testing', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/preflow';
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
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should pass with "/api/simple/" - pathWithSlashAtEnd', pathWithSlashAtEnd);
  it('should pass with "/api/simple" - pathWithNoSlashAtEnd', pathWithNoSlashAtEnd);
  it('should pass with "/api/" - simplePathWithSlashAtEnd', pathWithSlashAtEnd);
  it('should pass with "/api" - simplePathWithNoSlashAtEnd', pathWithNoSlashAtEnd);
  it('should pass with "/api/doesnotexist/" - doesNotExistPathWithSlashAtEnd', doesNotExistPathWithSlashAtEnd);
  it('should pass with "/api/doesnotexist" - doesNotExistPathWithNoSlashAtEnd', doesNotExistPathWithNoSlashAtEnd);
  it('should pass with "/api/noxibm" - noIBMExtensions', noIBMExtensions);
  it('should pass with "/api/noassembly" - noAssembly', noAssembly);
  it('should pass with "/api/noexecute" - noExecute', noExecute);
  
});

function pathWithSlashAtEnd(doneCB) {
  request
    .get('/api/')
    .expect(200, doneCB);
}

function pathWithNoSlashAtEnd(doneCB) {
  request
    .get('/api')
    .expect(200, doneCB);
}

function simplePathWithSlashAtEnd(doneCB) {
  request
    .get('/api/simple/')
    .expect(200, doneCB);
}

function simplePathWithNoSlashAtEnd(doneCB) {
  request
    .get('/api/simple')
    .expect(200, doneCB);
}

function doesNotExistPathWithSlashAtEnd(doneCB) {
  request
    .get('/api/doesnotexist/')
    .expect(404, doneCB);
}

function doesNotExistPathWithNoSlashAtEnd(doneCB) {
  request
    .get('/api/doesnotexist')
    .expect(404, doneCB);
}

function noIBMExtensions(doneCB) {
  request
    .get('/api/noxibm')
    .expect(200, doneCB);
}

function noAssembly(doneCB) {
  request
    .get('/api/noassembly')
    .expect(200, doneCB);
}

function noExecute(doneCB) {
  request
    .get('/api/noexecute')
    .expect(200, doneCB);
}
