// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
Promise.longStackTraces();
var fs = require('fs');
var path = require('path');
var mg = require('../lib/microgw');
var supertest = require('supertest');
var _ = require('lodash');
var assert = require('assert');
var debug  = require('debug')('tests:oauth');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var glob   = require('glob');
var YAML   = require('yamljs');
var apimServer = require('./support/mock-apim-server/apim-server');
var echo = require('./support/echo-server');

var configDir  = path.join(__dirname, 'definitions', 'oauth');

var request, httprequest;

function createSwagger () {
  var catalogDir = path.join(configDir, 'v1', 'catalogs', 'catalog007');

  // Make catalog007 directory
  function createCatalogDir () {
    return new Promise(function (resolve, reject) {
      mkdirp(catalogDir, function (err) {
        if (err)
          return reject(err);
        resolve();
      });
    });
  }

  // Find paths to all the YAML (Swagger) files under the configDir
  function findSwaggerYamls () {
    return new Promise(function (resolve, reject) {
      var yamlglob = path.join(configDir, '*.yaml');
      glob(yamlglob, function (err, files) {
        if (err)
          return reject(err);
        resolve(files);
      });
    });
  }

  // Convert swagger files from YAML to JSON, and add them to catalogDir
  function convertYamlsToJson (files) {
    var promises = files.map(function (yamlpath) {
      return new Promise(function (resolve, reject) {
        var fname = /^.*\/([^\/]+)\.yaml$/.exec(yamlpath)[1];
        var jsonpath = path.join(catalogDir, fname + '.json');
        var obj = YAML.load(yamlpath);
        var json = JSON.stringify(obj, null, 2);
        fs.writeFile(jsonpath, json, function (err) {
          if (err)
            return reject(err);
          resolve(yamlpath + ' converted to ' + jsonpath);
        });
      });
    });
    return Promise.all(promises);
  }

  return createCatalogDir()
    .then(findSwaggerYamls)
    .then(convertYamlsToJson)
    .then(function (results) {
      _.forEach(results, function (r) { debug(r); });
    });
}

function cleanupSwagger () {
  var catalogDir = path.join(configDir, 'v1', 'catalogs', 'catalog007');

  var options = {
    unlink: function (p, cb) {
      fs.unlink(p, function (err) {
        if (!err)
          debug('Removed', p);
        cb(err);
      });
    },

    rmdir: function (p, cb) {
      fs.rmdir(p, function (err) {
        if (!err)
          debug('Removed', p);
        cb(err);
      });
    }
  };

  return new Promise(function (resolve, reject) {
    rimraf(catalogDir, options, function (err) {
      if (err)
        return reject(err);
      resolve();
    });
  });
}

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

describe('oauth testing', function() {
  before(function(done) {
    process.env.CONFIG_DIR = configDir;
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        request = supertest(mg.app);
      })
      .then(done)
      .catch(function(err) {
        debug(err);
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

  //it('should pass with "/api/separateIds" - headerAndQueryIdsDiffReqs', headerAndQueryIdsDiffReqs);
  //it('should pass with "/api/joinedIds" - headerAndQueryIdsSameReq', headerAndQueryIdsSameReq);
  //it('should pass with "/api/tooManySchemes" - tooManySchemes', tooManySchemes);
  //it('should pass with "/api/badInType" - badInType', badInType);
  //it('should pass with "/api/missingSecurityDef" - missingSecurityDef', missingSecurityDef);
  //it('should pass with "/api/missingHeaderID" - missingHeaderID', missingHeaderID);
  //it('should pass with "/api/missingQueryParameterID" - missingQueryParameterID', missingQueryParameterID);
  //it('should pass with "/api/twoClientIDs" - twoClientIDs', twoClientIDs);
  //it('should pass with "/api/twoClientSecrets" - twoClientSecrets', twoClientSecrets);

  it('should pass requests through OAuth2 resource server - /resource-test/res1', function (done) {
    request
      .get('/resource-test/res1')
      .expect(200, done);
  });

  it('should pass requests through OAuth2 resource server - /resource-test/res3', function (done) {
    request
      .get('/resource-test/res3')
      .expect(200, done);
  });

});

describe('oauth testing onprem', function() {

  before(function(done) {
    process.env.CONFIG_DIR = configDir;
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(createSwagger)
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
        debug(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(cleanupSwagger)
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  //it('should pass with "/api/separateIds" - onprem headerAndQueryIdsDiffReqs', headerAndQueryIdsDiffReqs);
  //it('should pass with "/api/joinedIds" - onprem headerAndQueryIdsSameReq', headerAndQueryIdsSameReq);
  //it('should pass with "/api/tooManySchemes" - onprem tooManySchemes', tooManySchemes);
  //it('should pass with "/api/badInType" - onprem badInType', badInType);
  //it('should pass with "/api/missingSecurityDef" - onprem missingSecurityDef', missingSecurityDef);
  //it('should pass with "/api/missingHeaderID" - onprem missingHeaderID', missingHeaderID);
  //it('should pass with "/api/missingQueryParameterID" - onprem missingQueryParameterID', missingQueryParameterID);
  //it('should pass with "/api/twoClientIDs" - onprem twoClientIDs', twoClientIDs);
  //it('should pass with "/api/twoClientSecrets" - onprem twoClientSecrets', twoClientSecrets);

});

/*
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
*/
