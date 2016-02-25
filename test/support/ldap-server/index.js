'use strict';

let fs = require('fs');
let path = require('path');
let ldap = require('ldapjs');
let ldapconfig = require('./ldap-methods');



let server = ldap.createServer();

let tlsserver = (() => {
  let tls = require('./tls.json')[0];
  return ldap.createServer({ certificate: tls.certs[0].cert, key: tls['private-key'] });
})();

ldapconfig(server);
ldapconfig(tlsserver);


exports.start = function (port, tlsport) {
  return Promise.resolve()
    .then(() => new Promise(resolve => {
      server.listen(port, resolve);
    }))
    .then(() => new Promise(resolve => {
      if (tlsport)
        tlsserver.listen(tlsport, resolve);
      else {
        tlsserver = null;
        resolve();
      }
    }));
};

exports.stop = function() {
  return Promise.resolve().then(() => {
    server.close();
    if (!!tlsserver)
      tlsserver.close();
  });
};

if (require.main === module) {
  exports.start(1389, 1636).
    then(() => {
      console.log('ldap-server started on port 1389');
    });
}

