// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

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

