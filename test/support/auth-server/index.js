// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var http = require('http');
var https = require('https');
var ah = require('auth-header');

function theApplication(req, resp) {
  req.on('error', function(e) {
    console.log('The backend HTTP/HTTPS server receives error: %s', e);
  });

  var chunks = [];
  req.on('data', function(data) {
    chunks.push(data);
  });

  req.on('end', function() {
    //general cases
    try {
      //authenticate first
      var authHdr = req.headers.authorization;
      if (authHdr) {
        var results = ah.parse(authHdr).values;
        var auth = (results.length === 1 ? results[0] : null);
        if (auth) {
          if (auth.scheme === 'Basic') {
            var token = (new Buffer(auth.token, 'base64')).toString('utf-8');
            var tokens = token.split(':');
            if (!users[tokens[0]] || users[tokens[0]] !== tokens[1]) {
              resp.writeHead(401);
              resp.write('Not Authorized');
              resp.end();
              return;
            }
          } else {
            resp.writeHead(401);
            resp.write('Not Authorized');
            resp.end();
            return;
          }
        } else {
          resp.writeHead(401);
          resp.write('Not Authorized');
          resp.end();
          return;
        }
      } else {
        resp.writeHead(401);
        resp.write('Not Authorized');
        resp.end();
        return;
      }

      //prepare the 200 response
      resp.writeHead(200);
      resp.write('Authentication OK');
      resp.end();
    } catch (e) {
      console.log('The HTTP/HTTPS server catches exception: %s', e);
      resp.writeHead(500, 'javascript error');
      resp.write('Exception found in the index.js of the HTTP server: ' + e);
      resp.end();
    }
  });
}

//two servers: Sarah and Sandy
var sarahKeyf = fs.readFileSync(__dirname + '/sarah.key');
var sarahCertf = fs.readFileSync(__dirname + '/sarah.crt');

var users = require('./users');

//The server 'Sarah'
var sslOpts = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  requestCert: true,
};

var httpServer;
var httpsServer;
var dpBackendServer;

function theDPAuthApp(userCfg) {
  var accounts;
  if (userCfg) {
    accounts = require('./' + userCfg);
  }

  return function(req, resp) {
    req.on('error', function(e) {
      console.log('The DataPower Auth server receives error: %s', e);
    });

    var chunks = [];
    req.on('data', function(data) {
      chunks.push(data);
    });

    req.on('end', function() {
      //general cases
      try {
        //authenticate first
        var authHdr = req.headers.authorization;
        if (req.url !== '/' && authHdr && accounts) {
          var results = ah.parse(authHdr).values;
          var auth = (results.length === 1 ? results[0] : null);
          if (auth) {
            if (auth.scheme === 'Basic') {
              var token = (new Buffer(auth.token, 'base64')).toString('utf-8');
              var tokens = token.split(':');
              console.log('user auth:', tokens);
              if (!accounts[tokens[0]] || accounts[tokens[0]] !== tokens[1]) {
                resp.writeHead(401);
                resp.write('Not Authorized');
                resp.end();
                return;
              }
            } else {
              resp.writeHead(401);
              resp.write('Not Authorized');
              resp.end();
              return;
            }
          } else {
            resp.writeHead(401);
            resp.write('Not Authorized');
            resp.end();
            return;
          }
        }

        //prepare the 200 response
        resp.writeHeader(200, { 'IBM-App-User': 'tonyf' });
        resp.write('<response>');
        resp.end();
      } catch (e) {
        console.log('The DataPower Auth server catches exception: %s', e);
        resp.writeHead(500, 'javascript error');
        resp.write('Exception found in the DataPower Auth server: ' + e);
        resp.end();
      }
    });
  };
}

//This http Auth server is only used for DataPower backend servers
exports.dpAuth = function(port, userCfg) {
  if (port === undefined) {
    port = 3000;
  }

  return new Promise(function(resolve, reject) {
    //One http server
    dpBackendServer = http.createServer(theDPAuthApp(userCfg));
    dpBackendServer.listen(port);
    console.log('DataPower Auth server (http) is listening at port %d.', port);

    dpBackendServer.on('error', function(e) {
      console.log('DataPower Auth server receives an error: %s', e);
    });

    dpBackendServer.on('abort', function(e) {
      console.log('DataPowerAuth server receives an abort: %s', e);
    });

    resolve();
  });
};


exports.start = function(port) {
  if (port === undefined) {
    port = 3000;
  }

  return new Promise(function(resolve, reject) {
    //One http server
    //httpServer = http.createServer(app);
    httpServer = http.createServer(theApplication);
    httpServer.listen(port);
    console.log('Auth server (http) is listening at port %d.', port);

    httpServer.on('error', function(e) {
      console.log('Auth server receives an error: %s', e);
    });

    httpServer.on('abort', function(e) {
      console.log('Auth server receives an abort: %s', e);
    });

    httpsServer = https.createServer(sslOpts, theApplication);
    httpsServer.listen(port + 1);
    console.log('Auth server (https) is listening at port %d.', port + 1);

    httpsServer.on('error', function(e) {
      console.log('Auth server receives an error: %s', e);
    });

    httpsServer.on('abort', function(e) {
      console.log('Auth server receives an abort: %s', e);
    });

    resolve();
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    try {
      if (httpServer) {
        httpServer.close(function() {});
      }
      if (httpsServer) {
        httpsServer.close(function() {});
      }
      if (dpBackendServer) {
        dpBackendServer.close(function() {});
      }
    } catch (error) {
      console.log('Found error when stoping Auth servers: ', error);
    } finally {
      resolve();
    }
  });
};

