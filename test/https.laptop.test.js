'use strict';

var _ = require('lodash');
var assert = require('assert');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var yaml = require('yamljs');

var mg = require('../lib/microgw');

describe('HTTPS in laptop experience w/ env var', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/combined';
    process.env.NODE_ENV = 'production';
    process.env.TLS_SERVER_CONFIG = __dirname + '/support/https/tlsconfig.json'
    mg.start(3000)
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.TLS_SERVER_CONFIG;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });
  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) return done(); // expect error
        done(new Error('expect error'));
      });
  });

});

describe('HTTPS in laptop experience w/ default TLS', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/combined';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });
  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) return done(); // expect error
        done(new Error('expect error'));
      });
  });

});

describe('HTTP in laptop experience when HTTPS not specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });

});

describe('HTTPS in laptop experience when HTTPS explicitly specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });
  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) return done(); // expect error
        done(new Error('expect error'));
      });
  });

});

describe('HTTPS in laptop experience when schemes not specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });
  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) return done(); // expect error
        done(new Error('expect error'));
      });
  });

});
