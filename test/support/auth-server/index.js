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
        //general cases
        try {
            //authenticate first
            var authHdr = req.headers.authorization;
            if (authHdr) {
                var results = ah.parse(authHdr).values;
                var auth = (results.length === 1 ? results[0] : null);
                if (auth) {
                    if (auth.scheme == 'Basic') {
                        var token = (new Buffer(auth.token, 'base64')).toString('utf-8');
                        var tokens = token.split(':');
                        if (tokens[0] !== 'root' || tokens[1] !== 'Hunter2') {
                            resp.writeHead(401);
                            resp.write('Not Authorized');
                            resp.end();
                            return;
                        }
                    }
                    else {
                        resp.writeHead(401);
                        resp.write('Not Authorized');
                        resp.end();
                        return;
                    }
                }
                else {
                    resp.writeHead(401);
                    resp.write('Not Authorized');
                    resp.end();
                    return;
                }
            }
            else {
                resp.writeHead(401);
                resp.write('Not Authorized');
                resp.end();
                return;
            }

            //prepare the 200 response
            resp.write("Authentication OK");
            resp.end();
        }
        catch (e) {
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

//The server 'Sarah'
var sslOpts = {
    key: sarahKeyf,
    cert: sarahCertf,
    agent: false,
};

var httpServer;
var httpsServer;

exports.start = function(port) {
    if (port === undefined)
        port = 3000;

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
        console.log('Auth server (https) is listening at port %d.', port);

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
            if (httpServer)
                httpServer.close(function() {});
            if (httpsServer)
                httpsServer.close(function() {});
        }
        catch (error) {
            console.log('Found error when stoping Auth servers: ', error);
        }
        finally {
            resolve();
        }
    });
};

