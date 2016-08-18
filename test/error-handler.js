// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var express = require('express');
var request = require('supertest');

var context = require('../lib/context');
var errhandler = require('../lib/error-handler');

describe('Error middleware', function() {

  it('should return default status code and message', function(done) {
    var app = express();
    app.use(context());
    app.use(function(req, resp, next) {
      next('Error on purpose');
    });
    app.use(errhandler());
    request(app)
      .get('/')
      .expect(500, { name: 'GatewayError', message: 'Internal Server Error' }, done);
  });

  it('should return error message', function(done) {
    var errorObject = { name: 'TestError' };
    var app = express();
    app.use(context());
    app.use(function(req, resp, next) {
      next(errorObject);
    });
    app.use(errhandler());
    request(app)
      .get('/')
      .expect(500, errorObject, done);
  });

  it('should return customized status code and message', function(done) {
    var app = express();
    app.use(context());
    app.use(function(req, resp, next) {
      req.ctx.set('error.status.code', 777);
      req.ctx.set('error.status.reason', 'Not Allowed');
      next('error');
    });
    app.use(errhandler());
    request(app)
      .get('/')
      .expect(function(res) {
        if (res.statusCode !== 777) {
          throw new Error('status code not correct');
        }
        if (res.res.statusMessage !== 'Not Allowed') {
          throw new Error('status message not correct');
        }
      })
      .end(done);
  });

  it('should return customized headers', function(done) {
    var errorHeaders = { 'X-Error': 'Not working' };
    var app = express();
    app.use(context());
    app.use(function(req, resp, next) {
      req.ctx.set('error.headers', errorHeaders);
      next('error');
    });
    app.use(errhandler());
    request(app)
      .get('/')
      .expect('X-Error', 'Not working', done);
  });

});
