// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var microgw = require('../lib/microgw');
var apimServer = require('./support/mock-apim-server/apim-server');
var dsCleanup = require('./support/utils').dsCleanup;

describe('preflow-apimeta', function() {

  var request;
  before(function(done) {
    //Use production instead of CONFIG_DIR: reading from apim instead of laptop
    process.env.NODE_ENV = 'production';

    //The apim server and datastore
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;

    apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        __dirname + '/definitions/preflow-apimeta')
      .then(function() { return microgw.start(3000); })
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
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_PORT;
    delete process.env.DATASTORE_PORT;

    dsCleanup(5000)
      .then(function() { return apimServer.stop(); })
      .then(function() { return microgw.stop(); })
      .then(done, done)
      .catch(done);
  });

  var data = { msg: 'Hello world' };

  it('state-running-enforced-true', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-running-enforced-true')
      .send(data)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-suspended-enforced-true', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-suspended-enforced-true')
      .send(data)
      .expect(503)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-stopped-enforced-true', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-stopped-enforced-true')
      .send(data)
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-missing-enforced-true', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-missing-enforced-true')
      .send(data)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-running-enforced-false', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-running-enforced-false')
      .send(data)
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-suspended-enforced-false', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-suspended-enforced-false')
      .send(data)
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-stopped-enforced-false', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-stopped-enforced-false')
      .send(data)
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-missing-enforced-false', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-missing-enforced-false')
      .send(data)
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-running-enforced-missing', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-running-enforced-missing')
      .send(data)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-suspended-enforced-missing', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-suspended-enforced-missing')
      .send(data)
      .expect(503)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-stopped-enforced-missing', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-stopped-enforced-missing')
      .send(data)
      .expect(404)
      .end(function(err, res) {
        done(err);
      });
  });

  it('state-missing-enforced-missing', function(done) {
    this.timeout(10000);

    request
      .post('/preflow/state-missing-enforced-missing')
      .send(data)
      .expect(200)
      .end(function(err, res) {
        done(err);
      });
  });

});
