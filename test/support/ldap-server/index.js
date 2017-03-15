// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var Promise = require('bluebird');
var ldap = require('ldapjs');
var ldapconfig = require('./ldap-methods');

function createServer(usetls) {
  if (usetls) {
    var tls = require('./tls.json')[0];
    return ldap.createServer({
      certificate: tls.certs[0].cert,
      key: tls['private-key'] });
  }
  return ldap.createServer();
}

var server;
var tlsserver;

exports.start = function(port, tlsport) {
  if (server) {
    return Promise.resolve();
  }

  server = createServer();
  return ldapconfig(server)
    .then(function() {
      return new Promise(function(resolve) {
        server.listen(port, resolve);
      });
    })
    .then(function() {
      return new Promise(function(resolve) {
        if (tlsport) {
          tlsserver = createServer(true);
          ldapconfig(tlsserver).then(function() {
            return tlsserver.listen(tlsport, resolve);
          });
        } else {
          resolve();
        }
      });
    });
};

exports.stop = function() {
  return new Promise(function(resolve) {
    server.close();
    server = null;
    if (tlsserver) {
      tlsserver.close();
      tlsserver = null;
    }
    resolve();
  });
};

if (require.main === module) {
  exports.start(1389, 1636).then(function() {
    console.log('ldap-server started on port 1389');
  });
}

