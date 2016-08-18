// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var zlib = require('zlib');
var http = require('http');
var https = require('https');
var qs = require('qs');
var ah = require('auth-header');
var url = require('url');

function theApplication(req, resp) {
  req.on('error', function(e) {
    console.log('The backend HTTP/HTTPS server receives error: %s', e);
  });

  var chunks = [];
  req.on('data', function(data) {
    chunks.push(data);
  });

  req.on('end', function() {
    //special cases
    if (req.url === '/500') {
      resp.writeHead(500);
      resp.write('This is a test for 500 error');
      resp.end();
      return;
    } else if (req.url === '/form-urlencoded') {
      var postData = qs.stringify({ foo: 'bar', baz: [ 'qux', 'quux' ], corge: '' });
      resp.writeHead(200, { 'Content-Type': 'application/x-www-form-urlencoded',
                  'Content-Length': postData.length });
      resp.write(postData);
      resp.end();
      return;
    } else if (req.url === '/json') {
      resp.writeHead(200, { 'Content-Type': 'application/json' });
      resp.write('{ "qty": 150, "price": 23 }');
      resp.end();
      return;
    } else if (req.url === '/testOutput') {
      resp.writeHead(202, { 'X-TOKEN-ID': 'foo' });
      resp.write('You are accepted');
      resp.end();
      return;
    } else if (req.url === '/noChunks') {
      resp.writeHead(200, { 'Content-Length': 7 });
      resp.write('1234567');
      resp.end();
      return;
    }

    var query = url.parse(req.url, true).query;
    if (query.status) {
      //status code should not negative. Delay for a few seconds and let
      //the client to run into timeout (or the ConnectionError).
      if (query.status === '-1') {
        //delay the response a little bit
        console.log('Bad parameter. Delaying for seconds...');
        setTimeout(function() {
          resp.writeHead(500);
          resp.write('Bad "status" parameter');
          resp.end();
        }, 7000);
        return;
      }
      resp.writeHead(query.status);
      resp.write('This is a ' + query.status + ' response.');
      resp.end();
      return;
    }

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
            if (tokens[0] !== 'root' || tokens[1] !== 'Hunter2') {
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
      var buffer = Buffer.concat(chunks);
      var encoding = req.headers['content-encoding'];

      var data = '';
      data += 'z-method: ' + req.method + '\n';
      data += 'z-host: ' + req.headers.host + '\n';
      data += 'z-url: ' + req.url + '\n';
      data += 'z-auth: ' + authHdr + '\n';
      data += 'z-content-length: ' + req.headers['content-length'] + '\n';
      data += 'z-content-type: ' + req.headers['content-type'] + '\n';
      data += 'z-content-encoding: ' + encoding + '\n';
      data += 'z-transfer-encoding: ' + req.headers['transfer-encoding'] + '\n';
      data += 'z-user-agent: ' + req.headers['user-agent'] + '\n';
      if (req.headers['x-secret-msg1']) {
        data += 'z-secret-1: ' + req.headers['x-secret-msg1'] + '\n';
      }
      if (req.headers['x-secret-msg2']) {
        data += 'z-secret-2: ' + req.headers['x-secret-msg2'] + '\n';
      }


      //uncompress the request body
      if (encoding === 'gzip') {
        zlib.gunzip(buffer, function(err, out) {
          if (err) {
            console.log('The HTTP/HTTPS failed to unzip: %s', err);
            data += 'body: unzip error\n' + err;
          } else {
            data += 'raw: ' + buffer.toString('base64');
            data += 'body: ' + out;
          }
          resp.write(data);
          resp.end();
        });
      } else {
        var delay = parseInt(req.headers['x-delay-me'], 10);
        delay = (isNaN(delay) ? 0 : delay);
        if (delay > 0) {
          console.log('Server is going to take %d seconds to process', delay);
        }

        //delay the response a little bit
        setTimeout(function() {
          data += 'body: ' + buffer + '\n';
          resp.write(data);
          resp.end();
        }, delay * 1000);
      }
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
var sandyKeyf = fs.readFileSync(__dirname + '/sandy.key');
var sandyCertf = fs.readFileSync(__dirname + '/sandy.crt');
//two clients: Alice and Bob
var aliceCertf = fs.readFileSync(__dirname + '/alice.crt');
var bobCertf = fs.readFileSync(__dirname + '/bob.crt');
var rootCertf = fs.readFileSync(__dirname + '/root.crt');
var root2Certf = fs.readFileSync(__dirname + '/root2.crt');

//The server 'Sarah'
var sslOpts4Server = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
};

//The server 'Sandy'
var sslOpts4ServerSandy = {
  key: sandyKeyf,
  cert: sandyCertf,
  agent: false,
};

//The server supports only TLS 1.0
var sslOpts4ServerTls10 = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  secureProtocol: 'TLSv1_method',
  honorCipherOrder: true,
  ciphers: [ 'DES-CBC3-SHA',
             '!RC4',
             'HIGH',
             '!MD5',
             '!aNULL' ].join(':'),
};

//The server supports only some ciphers
var sslOpts4ServerWithCiphers = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  honorCipherOrder: true,
  ciphers: [ '!ECDHE-RSA-AES128-SHA256',
             'DHE-RSA-AES128-SHA256',
             'AES128-GCM-SHA256',
             '!RC4',
             'HIGH',
             '!MD5',
             '!aNULL' ].join(':'),
};

//The server talks with only Alice and Bob
var sslOpts4ServerForAliceAndBob = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  requestCert: true,
  rejectUnauthorized: true,
  ca: [ aliceCertf, bobCertf ] };

//The server 'sarah' authenticates its clients with 'root'
var sslOpts4SarahUsesCaRoot = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  requestCert: true,
  rejectUnauthorized: true,
  ca: [ rootCertf ] };

//The server 'sarah' authenticates its clients with 'root2'
var sslOpts4SarahUsesCaRoot2 = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  requestCert: true,
  rejectUnauthorized: true,
  ca: [ root2Certf ] };

//The server 'sandy' authenticates its clients with 'root2'
var sslOpts4SandyUsesCaRoot2 = {
  key: sarahKeyf,
  cert: sarahCertf,
  agent: false,
  requestCert: true,
  rejectUnauthorized: true,
  ca: [ root2Certf ] };

var httpServer;
var httpsServers = [];
var sslOpts = [
        [ 'Sarah', sslOpts4Server ],
        [ 'Sandy', sslOpts4ServerSandy ],
        [ 'ProtocolTLS10', sslOpts4ServerTls10 ],
        [ 'LimitedCiphers', sslOpts4ServerWithCiphers ],
        [ 'ForAliceAndBobOnly', sslOpts4ServerForAliceAndBob ],
        [ 'SarahUsesRoot', sslOpts4SarahUsesCaRoot ],
        [ 'SarahUsesRoot2', sslOpts4SarahUsesCaRoot2 ],
        [ 'SandyUsesRoot2', sslOpts4SandyUsesCaRoot2 ] ];

exports.start = function(port) {
  if (port === undefined) {
    port = 3000;
  }

  return new Promise(function(resolve, reject) {
    //One http server
    //httpServer = http.createServer(app);
    httpServer = http.createServer(theApplication).listen(port);
    console.log('HTTP server is listening at port %d.', port);

    httpServer.on('error', function(e) {
      console.log('HTTP server receives an error: %s', e);
    });

    httpServer.on('abort', function(e) {
      console.log('HTTP server receives an abort: %s', e);
    });

    //Four https servers
    for (var i = 0; i < sslOpts.length; i++) {
      //httpsServers[i] = https.createServer(sslOpts[i][1], app);
      httpsServers[i] = https.createServer(sslOpts[i][1], theApplication)
        .listen(port + 1 + i);
      console.log('HTTPS server (%s) is listening at port %d.',
        sslOpts[i][0], port + 1 + i);

      httpsServers[i].on('error', function(e) {
        console.log('HTTPS server (%s) receives an error: %s',
          sslOpts[i][0], e);
      });

      httpsServers[i].on('abort', function(e) {
        console.log('HTTPS server (%s) receives an abort: %s',
          sslOpts[i][0], e);
      });
    }

    resolve();
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    try {
      var closeCounter = 0;
      if (httpServer) {
        httpServer.close(function() {});
      }
      if (httpsServers && httpsServers.length > 0) {
        for (var i = 0; i < httpsServers.length; i++) {
          httpsServers[i].close(function() {
            closeCounter++;
            if (closeCounter === httpsServers.length) {
              resolve();
            }
          });
        }
      }
    } catch (error) {
      console.log('Found error when stoping HTTP/HTTPS servers: ', error);
    }
  });
};

