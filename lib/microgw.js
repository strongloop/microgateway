// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
var express = require('express');
var urlrewrite = require('./urlrewrite');
var context = require('./context');
var preflow = require('./preflow');
var postflow = require('./postflow');
var assembly = require('./assembly');
var ds = require('../datastore');
var path = require('path');
var ploader = require('./policy-loader');
var fs = require('fs');
var https = require('https');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:microgw' });
var errhandler = require('./error-handler');
var analytics = require('./analytics');
var oauthAZServer = require('./oauth2/az-server');
var wlpnPassword = require('wlpn-password');

//load policies
//if there is projectDir, pass it as one of the option
var policies = ploader.createMGLoader({ override: false });

var app = express();
app.use(urlrewrite());
app.use(context(ctx_config));
app.use(analytics({}));
app.use(preflow({}));
app.use(oauthAZServer({}));
app.use(assembly({ policies: policies.getPolicies() }));
app.use(postflow());
app.use(errhandler());

//need to monkey patch the HttpParser for the socket.bytesRead
var mkPatch = analytics.mkPatch;
var kOnExecute = process.binding('http_parser').HTTPParser.kOnExecute;

var server;
exports.start = function(port) {
  return new Promise(function(resolve, reject) {
    ds.start(process.env.NODE_ENV === 'production')
      .then(function(useHttps) {
        port = port || process.env.PORT || (useHttps ? 443 : 80);
        logger.debug('starting gateway ', port);
        if (useHttps) {
          if (!process.env.TLS_SERVER_CONFIG) {
            process.env.TLS_SERVER_CONFIG = path.resolve(__dirname, '../config/defaultTLS.json');
          }

          // Load the configuration file
          var stats = fs.statSync(process.env.TLS_SERVER_CONFIG);
          if (!stats.isFile()) {
            throw new Error('Invalid TLS server configuration file');
          }
          var options = JSON.parse(fs.readFileSync(process.env.TLS_SERVER_CONFIG));

          // manipulate options content
          var dirname = path.dirname(process.env.TLS_SERVER_CONFIG);
          var filesToRead = [ 'pfx', 'key', 'cert', 'ca', 'dhparam', 'ticketKeys', 'passphrase' ];
          filesToRead.forEach(function(file) {
            if (options[file]) {
              var potentialFile;
              if (Array.isArray(options[file])) { // ca is capable of being an array
                for (var i = 0; i < options[file].length; i++) {
                  try {
                    potentialFile = path.join(dirname, options[file][i]);
                    stats = fs.statSync(potentialFile);
                    if (stats.isFile()) {
                      options[file][i] = fs.readFileSync(potentialFile);
                    }
                  } catch (e) {}
                }
              } else {
                try {
                  var filename = options[file];
                  var property;
                  if (filename.indexOf(':')) {
                    var array = filename.split(':');
                    filename = array[0];
                    property = array[1];
                  }
                  potentialFile = path.join(dirname, filename);
                  stats = fs.statSync(potentialFile);
                  if (stats.isFile()) {
                    options[file] = fs.readFileSync(potentialFile);
                    if (property) {
                      var parsedFile = JSON.parse(options[file]);
                      options[file] = parsedFile[property];
                    }
                  }
                } catch (e) {}
              }
            }
          });

          if (options.passphrase) {
            options.passphrase = wlpnPassword.decode(options.passphrase);
          }

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
        if (mkPatch) {
          server.on('connection', function(socket) {
            var parser = socket.parser;
            if (parser) {
              var origExecute = parser[kOnExecute];
              socket._bytesRead = 0;
              parser[kOnExecute] = function(ret, d) {
                parser.socket._bytesRead += ret;
                origExecute(ret, d);
              };
            }
          });
        }
      })
      .then(function() {
        // Node's HTTP library defaults to a 2-minute timeout, but needs to be increased to support 2-minute timeouts
        // for maintain parity with DataPower's Basic Auth with Auth URLs
        server.setTimeout(125000);
      })
      .catch(function(err) {
        logger.debug('micro-gateway failed to start: ', err);
        ds.stop()
          .then(function() {
            reject(err);
          });
      });
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    ds.stop()
      .then(function() {
        if (server) {
          server.close(function() {
            resolve();
          });
        } else {
          resolve();
        }
      })
      .catch(reject);
  });
};

exports.app = app;

if (require.main === module) {
  exports.start().then(function() {});
}

var ctx_config = {
  request: {
    contentTypeMaps: [
      { 'application/json': [ '*/json', '+json', '*/javascript' ] },
      { 'application/xml': [ '*/xml', '+xml' ] } ],
    bodyFilter: {
      DELETE: 'reject',
      GET: 'reject',
      HEAD: 'reject',
      OPTIONS: 'ignore' } },
  system: {
    datetimeFormat: 'YYYY-MM-DDTHH:mm:ssZ',
    timezoneFormat: 'Z' } };
