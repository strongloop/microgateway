'use strict';

let ldap = require('ldapjs');
let ldapconfig = require('./ldap-methods');

function createServer (usetls) {
  if (usetls) {
    let tls = require('./tls.json')[0];
    return ldap.createServer({certificate: tls.certs[0].cert, key: tls['private-key']});
  }
  return ldap.createServer();
}

let server;
let tlsserver;


exports.start = function (port, tlsport) {
  if (!!server) return Promise.resolve();

  server = createServer();
  return ldapconfig(server)
    .then(() => new Promise(resolve => {
      server.listen(port, resolve);
    }))
    .then(() => new Promise(resolve => {
      if (tlsport) {
        tlsserver = createServer(true);
        ldapconfig(tlsserver).then(() => {
          tlsserver.listen(tlsport, resolve);
        });
      }
      else {
        resolve();
      }
    }));
};

exports.stop = function() {
  return new Promise((resolve) => {
    server.close();
    server = null;
    if (!!tlsserver) {
      tlsserver.close();
      tlsserver = null;
    }
    resolve();
  });
};

if (require.main === module) {
  exports.start(1389, 1636).
    then(() => {
      console.log('ldap-server started on port 1389');
    });
}

