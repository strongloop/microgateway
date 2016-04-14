// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*eslint-env node */
'use strict';

var express   = require('express');
var app       = express();
var https     = require('https');
var logger    = require('apiconnect-cli-logger/logger.js')
                 .child({loc: 'apiconnect-microgateway:analytics-moc-server'});
var options   = require('./httpsOptions');
var fs        = require('fs');
var path      = require('path');
var bdParser  = require('body-parser');
var utils     = require('../../../utils/utils')

var doneCB;

var rawParser = bdParser.raw( {'type': '*/*'});
app.post('/x2020/v1/events/_bulk', rawParser, function(req, res, next) {
  logger.debug('got analytics event', req.headers);
  if (doneCB) {
    doneCB(req.body.toString());
    doneCB = undefined;
  }
  res.status(200);
  res.end();
  next();
});


var server;
exports.start = function(port) {
  return new Promise(function(resolve) {
    var defaultTLS = utils.getTLSConfigSync();
    options.requestCert = true;
    options.rejectUnauthorized = true;
    options.ca = [defaultTLS.cert];

    server = https.createServer(options, app).listen(port, function() {
      logger.debug('moc server started on port:', port);
      resolve();
//      server = app.listen(port, function() {
//      resolve();
    });
  });
};

exports.stop = function() {
  return new Promise(function(resolve) {
    if (server) {
      server.close(function() {
        logger.debug('moc server stopped');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
};

exports.setOneTimeDoneCB = function(cb) {
  if (cb instanceof Function) {
    doneCB = cb;
  }
};

exports.app = app;
