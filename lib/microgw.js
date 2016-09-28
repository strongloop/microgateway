// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
var express = require('express');
var urlrewrite = require('./urlrewrite');
var context = require('./context');
var apiLoader = require('./api-loader');
var apiMatcher = require('./api-matcher');
var securityCheck = require('./security-check');
var cors = require('./cors');
var rateLimit = require('./rate-limit');
var apimContext = require('./apim-context');
var postflow = require('./postflow');
var assembly = require('./assembly');
var ds = require('../datastore');
var ploader = require('./policy-loader');
var https = require('https');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:microgw' });
var errhandler = require('./error-handler');
var analytics = require('./analytics');
var oauthAZServer = require('./oauth2/az-server');
var getTLSConfig = require('../utils/utils').getTLSConfigSync;

//load policies
//if there is projectDir, pass it as one of the option
var policies = ploader.createMGLoader({ override: false });

var app = express();
app.use(urlrewrite());
app.use(context(ctx_config));
app.use(analytics({}));
app.use(apiLoader({}));
app.use(apiMatcher({}));
app.use(securityCheck({}));
app.use(cors({}));
app.use(rateLimit({}));
app.use(apimContext({}));
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
          var options = getTLSConfig();

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
      DELETE: 'ignore',
      GET: 'ignore',
      HEAD: 'ignore',
      OPTIONS: 'ignore' } },
  system: {
    datetimeFormat: 'YYYY-MM-DDTHH:mm:ssZ',
    timezoneFormat: 'Z' } };
