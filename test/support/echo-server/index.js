// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
var express = require('express');
var https = require('https');
var app = express();
var ah = require('auth-header');

app.get('/auth', function(req, resp) {
  var results = ah.parse(req.get('authorization')).values;
  var auth = results.length === 1 ? results[0] : null;
  if (auth && auth.scheme === 'Basic') {
    var t = (new Buffer(auth.token, 'base64')).toString('utf-8');
    var user = t.split(':');
    if (user[0] === 'root' && user[1] === 'Hunter2') {
      resp.sendStatus(200);
    } else {
      resp.sendStatus(401);
    }
  } else {
    resp.sendStatus(401);
  }
});

app.get('/slowauth', function(req, resp) {
  var results = ah.parse(req.get('authorization')).values;
  var auth = results.length === 1 ? results[0] : null;
  setTimeout(function() {
    if (auth && auth.scheme === 'Basic') {
      var t = (new Buffer(auth.token, 'base64')).toString('utf-8');
      var user = t.split(':');
      if (user[0] === 'root' && user[1] === 'Hunter2') {
        resp.sendStatus(200);
      } else {
        resp.sendStatus(401);
      }
    } else {
      resp.sendStatus(401);
    }
  }, 125000);
});

app.get('/*', function(req, resp) {
  resp.send(req.url);
});

app.post('/*', function(req, resp) {
  resp.writeHead(200, req.headers);
  req.pipe(resp);
});

app.put('/*', function(req, resp) {
  resp.writeHead(200, req.headers);
  req.pipe(resp);
});

var server;
var tlsserver;
exports.start = function(port) {
  return new Promise(function(resolve, reject) {
    server = app.listen(port, function() {
      var tls = require('./tls')[0];
      tlsserver = https.createServer({
        key: tls['private-key'],
        cert: tls.certs[0].cert }, app).listen(61801);
      resolve();
    });
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    if (tlsserver) {
      tlsserver.close();
      tlsserver = null;
    }

    if (server) {
      server.close(function() {
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
};

exports.app = app;

if (require.main === module) {
  exports.start(8889);
}
