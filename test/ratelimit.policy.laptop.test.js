'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var supertest = require('supertest');
var echo = require('./support/echo-server');
var mg = require('../lib/microgw');
var should = require('should');

describe('ratelimit basic policy', function() {

  var request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/ratelimit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(() => {
        return echo.start(8889);
      })
      .then(() => {
        request = supertest('http://localhost:3000');
      })
      .then(done)
      .catch((err) => {
        console.error(err);
        done(err);
      });
  });

  after((done) => {
    mg.stop()
      .then(() => echo.stop())
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect ratelimit header', function(done) {
    request
      .get('/ratelimit/ratelimit')
      .expect('x-ratelimit-limit', '100')
      .expect(function(res) {
        var remaining = Number(res.headers['x-ratelimit-remaining']);
        remaining.should.lessThan(100);
      })
      .expect(200, done);
  });
});
