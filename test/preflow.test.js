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
  it('should pass with "/api/doesnotexist/" - doesNotExistPathWtihSlashAtEnd', doesNotExistPathWtihSlashAtEnd);
  it('should pass with "/api/doesnotexist" - doesNotExistPathWtihNoSlashAtEnd', doesNotExistPathWtihNoSlashAtEnd);
  
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
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should not able to modify read-only context variables', function(doneCB) {
    var roCtx = ['client.app.id',
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
                 'env'];
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
            doneCB(new Error('the following ctx vars failed:' 
                + JSON.stringify(failed)));
          }
        }
      });
    }

  });
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