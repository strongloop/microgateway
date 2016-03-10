'use strict'

var Promise = require('bluebird');
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
var https   = require('https');
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

var server;
exports.start = function(port) {
  return new Promise(function(resolve, reject) {
    ds.start(process.env.NODE_ENV === 'production')
      .then(function() {
        logger.debug ('starting gateway ', port);
        if (process.env.TLS_SERVER_CONFIG) { // don't care the value, if it's set, we assume HTTPS
          // Load the configuration file
          var stats = fs.statSync(process.env.TLS_SERVER_CONFIG);
          if (!stats.isFile())
            throw new Errror('Invalid TLS server configuration file');
          var options = JSON.parse(fs.readFileSync(process.env.TLS_SERVER_CONFIG));

          // manipulate options content
          var dirname = path.dirname(process.env.TLS_SERVER_CONFIG);
          var filesToRead = ['pfx', 'key', 'cert', 'ca', 'dhparam', 'ticketKeys'];
          filesToRead.forEach(function (file) {
            if(options[file]) {
              if(Array.isArray(options[file])) { // ca is capable of being an array
                for(var i = 0; i < options[file].length; i++) {
                  try {
                    var potentialFile = path.join(dirname, options[file][i]);
                    stats = fs.statSync(potentialFile);
                    if (stats.isFile()) {
                      options[file][i] = fs.readFileSync(potentialFile);
                    }
                  } catch(e) {}
                }
              }
              else {
                try {
                  var potentialFile = path.join(dirname, options[file]);
                  stats = fs.statSync(potentialFile);
                  if (stats.isFile()) {
                    options[file] = fs.readFileSync(potentialFile);
                  }
                } catch(e) {}
              }
            }
          });

          // let's finally create the server
          server = https.createServer(options, app).listen(port, function() {
            logger.debug('micro-gateway listening on port %d', port);
            resolve();
          });
        } else {
          server = app.listen(port, function() {
            logger.debug('micro-gateway listening on port %d', port);
            resolve();
          });
        }
      }).catch(function(err) {
        logger.debug('micro-gateway failed to start: ', err);
        reject(err);
      });
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    ds.stop()
      .then(function() {
        server.close(function() {
          resolve();
        });
      })
      .catch(reject);
  });
};

exports.app = app;

if (require.main === module) {
  exports.start(5000).
    then(function() {
      logger.debug('micro-gateway listening on port 5000');
    });
}

var ctx_config = {
  request: {
    'contentTypeMaps': [
      {'application/json': ['*/json', '+json', '*/javascript']},
      {'application/xml': ['*/xml', '+xml']}
    ],
    'bodyFilter': {
      'DELETE': 'reject',
      'GET': 'reject',
      'HEAD': 'reject',
      'OPTIONS': 'ignore'
    }
  },
  system: {
    'datetimeFormat': 'YYYY-MM-DDTHH:mm:ssZ',
    'timezoneFormat': 'Z'
  }
};
