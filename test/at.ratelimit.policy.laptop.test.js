// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var should = require('should');
var async = require('async');

describe('ratelimit basic policy', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/ratelimit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        done(err);
      });
  });

  after(function(done) {
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.APIMANAGER;
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    // A hacky way to reset rate limiters
    var limiters = require('../lib/preflow/apim-lookup').rateLimiters;
    for (var i in limiters) {
      delete limiters[i];
    }
  });

  it('should expect ratelimit header', function(done) {
    request
      .get('/ratelimit/ratelimit')
      .expect('x-ratelimit-limit', '100')
      .end(function(err, res) {
        if (err) return done(err);
        var remaining = Number(res.headers['x-ratelimit-remaining']);
        remaining.should.be.lessThan(100);
        done();
      });
  });

  it('should expect ratelimit rejection', function(done) {
    var reject = {};
    async.timesSeries(100, function(i, done) {
      request
        .get('/ratelimit/ratelimit')
        .end(function(err, res) {
          if (res.statusCode === 429) {
            reject = res.body;
          }
          done(err);
        });
    }, function(err) {
      reject.should.be.eql(
        {message: 'Rate limit exceeded', name: 'RateLimitExceeded'});
      done(err);
    });
  });

});
