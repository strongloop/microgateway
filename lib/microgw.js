'use strict'

var express = require('express');
var urlrewrite = require('./urlrewrite');
var context = require('./context');
var preflow = require('./preflow');
var postflow = require('./postflow');
var assembly = require('./assembly');
var cleanup = require('./cleanup');
var ds = require('../datastore');
var path = require('path');
var ploader = require('./policy-loader');
var _       = require('lodash');
var fs      = require('fs');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:microgw'});
var errhandler = require('./error-handler');
var analytics = require('./analytics');

//load policies
//if there is projectDir, pass it as one of the option
var policies = ploader.createMGLoader({'override':false});

var app = express();
app.use(urlrewrite());
app.use(context(ctx_config));
app.use(analytics({}));
app.use(preflow({}));
app.use(assembly({policies : policies.getPolicies()}));
app.use(cleanup());
app.use(postflow());
app.use(errhandler());

let server;
exports.start = function(port) {
  return new Promise((resolve, reject) => {
    ds.start(process.env.NODE_ENV === 'production')
      .then(() => {
        logger.debug ('starting gateway ', port);
        server = app.listen(port, function() {
          logger.debug('micro-gateway listening on port %d', port);
          resolve();
        });
      }).catch((err) => {
        logger.debug('micro-gateway failed to start: ', err);
        reject(err);
      });
  });
};

exports.stop = function() {
  return new Promise((resolve, reject) => {
    ds.stop()
      .then(() => {
        server.close(() => {
          resolve();
        });
      })
      .catch(reject);
  });
};

exports.app = app;

if (require.main === module) {
  exports.start(5000).
    then(() => {
      logger.debug('micro-gateway listening on port 5000');
    });
}

var ctx_config = {
  'request': {
    'contentTypeMaps': [
      {'application/json': ['*/json', '+json', '*/javascript']},
      {'application/xml': ['*/xml', '+xml']}
    ],
    'bodyParser': [
      {'json': ['json', '+json']},
      {'text': ['text/*', '*/xml', '+xml']},  // XML parser not available
      {'urlencoded': ['*/x-www-form-urlencoded']}
    ],
    'bodyFilter': {
      'DELETE': 'reject',
      'GET': 'reject',
      'HEAD': 'reject',
      'OPTIONS': 'ignore'
    }
  },
  'message': {
  },
  'system': {
    'datetimeFormat': 'YYYY-MM-DDTHH:mm:ssZ',
    'timezoneFormat': 'Z'
  }
};
