// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var mg = require('../lib/microgw');
var supertest = require('supertest');

var dsCleanup = require('./support/utils').dsCleanup;
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;
var apimServer = require('./support/mock-apim-server/apim-server');
var echo = require('./support/echo-server');

var request;

describe('preflow testing', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/preflow';
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
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
  it('should pass with "/" - rootBasePathAndPath', rootBasePathAndPath);
  it('should pass with "/rootbasepath" - rootBasePath', rootBasePath);
  it('should pass with "/rootbasepath/" - rootBasePathWithSlashAtEnd', rootBasePathWithSlashAtEnd);
  it('should pass with "/rootbasepath/foo" - rootBasePathVarPath', rootBasePathVarPath);
  it('should pass with "/rootbasepath/foo/" - rootBasePathVarPathWithSlashAtEnd', rootBasePathVarPathWithSlashAtEnd);
  it('should fail with "/rootbasepath/foo/bar" - rootBasePathVarPathFail', rootBasePathVarPathFail);
  it('should pass with "/rootbasepath/a/b/c/d" - rootBasePathMultiVarPath', rootBasePathMultiVarPath);
  it('should pass with "/rootbasepath/a/b/c/d/" - rootBasePathMultiVarPathWithSlashAtEnd',
          rootBasePathMultiVarPathWithSlashAtEnd);
  it('should fail with "/rootbasepath/a/b" - rootBasePathMultiVarPathFail',
          rootBasePathMultiVarPathFail);

});

describe('ro-context testing', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/preflow/context';
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
    dsCleanupFile();
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should not able to modify read-only context variables', function(doneCB) {
    var roCtx = [ 'client.app.id',
                  'client.app.name',
                  'client.app.secret',
                  'client.org.id',
                  'client',
                  'plan.id',
                  'plan.name',
                  'plan.version',
                  'plan.rate-limit',
                  'plan',
                  'env.path',
                  'env' ];
    var failed = [];
    var counter = 0;
    for (var index = 0, len = roCtx.length; index < len; index++) {
      request
      .get('/ro-context/')
      .set('x-ro-name', roCtx[index])
      .expect(200, function(e) {
        if (e) {
          console.error(e);
          failed.push(roCtx[index]);
        }
        counter++;
        //checking the last one
        if (counter === roCtx.length) {
          if (failed.length === 0) {
            doneCB();
          } else {
            doneCB(new Error('the following ctx vars failed: '
                + JSON.stringify(failed)));
          }
        }
      });
    }

  });
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
    dsCleanupFile();
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

/*
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
*/

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

function rootBasePathAndPath(doneCB) {
  request
    .get('/')
    .expect(200, '/', doneCB);
}

function rootBasePath(doneCB) {
  request
    .get('/rootbasepath')
    .expect(200, '/rootbasepath', doneCB);
}

function rootBasePathWithSlashAtEnd(doneCB) {
  request
    .get('/rootbasepath/')
    .expect(200, '/rootbasepath/', doneCB);
}

function rootBasePathVarPath(doneCB) {
  request
    .get('/rootbasepath/foo')
    .expect(200, '/rootbasepath/foo', doneCB);
}

function rootBasePathVarPathWithSlashAtEnd(doneCB) {
  request
    .get('/rootbasepath/foo/')
    .expect(200, '/rootbasepath/foo/', doneCB);
}

function rootBasePathVarPathFail(doneCB) {
  request
    .get('/rootbasepath/foo/bar')
    .expect(404, doneCB);
}

function rootBasePathMultiVarPath(doneCB) {
  request
    .get('/rootbasepath/a/b/c/d')
    .expect(200, '/rootbasepath/a/b/c/d', doneCB);
}

function rootBasePathMultiVarPathWithSlashAtEnd(doneCB) {
  request
    .get('/rootbasepath/a/b/c/d/')
    .expect(200, '/rootbasepath/a/b/c/d/', doneCB);
}

function rootBasePathMultiVarPathFail(doneCB) {
  request
    .get('/rootbasepath/a/b')
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
