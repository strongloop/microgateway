// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var mg = require('../lib/microgw');
var supertest = require('supertest');
var _ = require('lodash');
var assert = require('assert');
var apimServer = require('./support/mock-apim-server/apim-server');
var echo = require('./support/echo-server');

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
  it('should pass with "/api/doesnotexist/" - doesNotExistPathWtihSlashAtEnd', doesNotExistPathWtihSlashAtEnd);
  it('should pass with "/api/doesnotexist" - doesNotExistPathWtihNoSlashAtEnd', doesNotExistPathWtihNoSlashAtEnd);
  
});

describe('preflow testing', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/preflow/security';
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

  it('should pass with "/api/separateIds" - headerAndQueryIdsDiffReqs', headerAndQueryIdsDiffReqs);
  it('should pass with "/api/joinedIds" - headerAndQueryIdsSameReq', headerAndQueryIdsSameReq);
  it('should pass with "/api/tooManySchemes" - tooManySchemes', tooManySchemes);
  it('should pass with "/api/badInType" - badInType', badInType);
  it('should pass with "/api/missingSecurityDef" - missingSecurityDef', missingSecurityDef);
  it('should pass with "/api/missingHeaderID" - missingHeaderID', missingHeaderID);
  it('should pass with "/api/missingQueryParameterID" - missingQueryParameterID', missingQueryParameterID);
  it('should pass with "/api/twoClientIDs" - twoClientIDs', twoClientIDs);
  it('should pass with "/api/twoClientSecrets" - twoClientSecrets', twoClientSecrets);
  
});

describe('preflow testing onprem', function() {

  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/preflow/security';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
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

  it('should pass with "/api/separateIds" - onprem headerAndQueryIdsDiffReqs', headerAndQueryIdsDiffReqs);
  it('should pass with "/api/joinedIds" - onprem headerAndQueryIdsSameReq', headerAndQueryIdsSameReq);
  it('should pass with "/api/tooManySchemes" - onprem tooManySchemes', tooManySchemes);
  it('should pass with "/api/badInType" - onprem badInType', badInType);
  it('should pass with "/api/missingSecurityDef" - onprem missingSecurityDef', missingSecurityDef);
  it('should pass with "/api/missingHeaderID" - onprem missingHeaderID', missingHeaderID);
  it('should pass with "/api/missingQueryParameterID" - onprem missingQueryParameterID', missingQueryParameterID);
  it('should pass with "/api/twoClientIDs" - onprem twoClientIDs', twoClientIDs);
  it('should pass with "/api/twoClientSecrets" - onprem twoClientSecrets', twoClientSecrets);

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

function doesNotExistPathWtihSlashAtEnd(doneCB) {
  request
    .get('/api/doesnotexist/')
    .expect(404, doneCB);
}

function doesNotExistPathWtihNoSlashAtEnd(doneCB) {
  request
    .get('/api/doesnotexist')
    .expect(404, doneCB);
}

function headerAndQueryIdsDiffReqs(doneCB) {
  request
    .get('/api/separateIds?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(200, doneCB);
}

function headerAndQueryIdsSameReq(doneCB) {
  request
    .get('/api/joinedIds?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function tooManySchemes(doneCB) {
  request
    .get('/api/tooManySchemes?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function badInType(doneCB) {
  request
    .get('/api/badInType?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function missingSecurityDef(doneCB) {
  request
    .get('/api/missingSecurityDef?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function missingHeaderID(doneCB) {
  request
    .get('/api/missingHeaderID?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function missingQueryParameterID(doneCB) {
  request
    .get('/api/missingQueryParameterID?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function twoClientIDs(doneCB) {
  request
    .get('/api/twoClientIDs?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}

function twoClientSecrets(doneCB) {
  request
    .get('/api/twoClientSecrets?client_id=default&client_secret=SECRET')
    .set('X-IBM-Client-Id', 'default')
    .set('X-IBM-Client-Secret', 'SECRET')
    .expect(404, doneCB);
}
