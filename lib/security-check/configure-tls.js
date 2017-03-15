// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var tls = require('tls');
var cipherMappings = require('../cipher-suites');

var availableCiphers = tls.getCiphers().map(
        function(c) { return c.toUpperCase(); });

function getCiphers(profileCiphers) {
  return profileCiphers
    .map(function(c) { return c.toUpperCase(); })
    .map(function(c) { return cipherMappings[c]; })
    .filter(function(c) { return availableCiphers.indexOf(c) !== -1; })
    .join(':');
}

function configureTls(tlsprofile) {
  var cert;
  var caList = [];
  for (var i in tlsprofile.certs) {
    var o = tlsprofile.certs[i];
    if (o && o['cert-type'] === 'PUBLIC') {
      // options.ca is not an array
      cert = o.cert;
    } else if (o && o['cert-type'] === 'CLIENT') {
      caList.push(o.cert);
    }
  }

  return { key: tlsprofile['private-key'],
    cert: cert,
    ca: caList,
    ciphers: getCiphers(tlsprofile.ciphers),
    rejectUnauthorized: !!tlsprofile['mutual-auth'] };
}

module.exports = configureTls;
