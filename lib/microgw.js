'use strict'

var express = require('express');
var context = require('./context');
var preflow = require('./preflow');
var assembly = require('./assembly');
var ds = require('../datastore');
var app = express();

app.use(context(ctx_config));
app.use(preflow({}));
app.use(assembly({}));

let server;
exports.start = function(port) {
  return new Promise((resolve, reject) => {
    ds.start(process.env.NODE_ENV === 'production')
      .then(() => {
        console.log ('starting gateway ', port);
        server = app.listen(port, function() {
          console.log('micro-gateway listening on port %d', port);
          resolve();
        });
      }).catch((err) => {
        console.log('micro-gateway failed to start: ', err);
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
      console.log('micro-gateway listening on port 5000');
    });
}

var ctx_config = {
  'request': {
    'contentTypeMaps': [
      {'application/json': ['*/json', '+json', '*/javascript']},
      {'application/xml': ['*/xml', '+xml']}
    ]
  },
  'message': {
    'bodyParser': [
      {'json': ['json', '+json']},
      {'text': ['text/*']},
      {'urlencoded': ['*/x-www-form-urlencoded']}
    ],
    'bodyFilter': {
      'DELETE': 'reject',
      'GET': 'reject',
      'HEAD': 'reject',
      'OPTIONS': 'ignore'
    }
  },
  'system': {
    'datetimeFormat': 'YYYY-MM-DDTHH:mm:ssZ',
    'timezoneFormat': 'Z'
  }
};

