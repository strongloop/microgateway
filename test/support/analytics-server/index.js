// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*eslint-env node */
'use strict';

var express   = require('express');

var https     = require('https');
var logger    = require('apiconnect-cli-logger/logger.js')
                 .child({loc: 'apiconnect-microgateway:analytics-moc-server'});
var options   = require('./httpsOptions');
var fs        = require('fs');
var path      = require('path');
var bdParser  = require('body-parser');
var env       = require('../../../utils/environment');
var crypto    = require('crypto');
var constants = require('constants');

var doneCB;


var server;
exports.start = function(port, definition) {
  return new Promise(function(resolve) {
    options.rejectUnauthorized = true;
    var rawParser = bdParser.raw( {'type': '*/*'});
    var app       = express();

    //for analytics event publish
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

    //for handshake
    var handshakeURI = '/v1/catalogs/' + 
        process.env[env.APIMANAGER_CATALOG] + '/handshake/';

    app.post(handshakeURI,function(req, res, next) {
      logger.debug('got handshake request, headers:', req.headers);
      //get pub key
      var pubKey = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', env.KEYNAME + '.pub'));
      var encKey = crypto.randomBytes(32);
      
      var key = crypto.publicEncrypt(
        {
          key: pubKey.toString(),
          padding: constants.RSA_PKCS1_PADDING
        },
        encKey
      );

      var payload = { 'microGateway' : 
          { 'cert' : undefined,
            'key': undefined,
            'clientID' : 'a-moc-client-id-from-moc-server'
          }
      };
      
      var iv = new Buffer(16);
      iv.fill(0);
      var cipher = crypto.createCipheriv('aes-256-cbc', encKey, iv);
      var cipheredText = cipher.update(JSON.stringify(payload), 'utf-8', 'base64');
      cipheredText += cipher.final('base64');
      var msg = { 'key': key.toString('base64'), 'cipher': cipheredText};

      res.status(200);
      res.end(JSON.stringify(msg));
      next();
    });

    app.use('/v1', express.static(definition));

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


