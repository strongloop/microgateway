'use strict';

var tls = require('tls');
var cipherMappings = require('../cipher-suites');

var availableCiphers = tls.getCiphers().map(function(c) { return c.toUpperCase(); });

function getCiphers (profileCiphers) {
  return profileCiphers
    .map(function(c) { return c.toUpperCase(); })
    .map(function(c) { return cipherMappings[c]; })
    .filter(function(c) { return availableCiphers.indexOf(c) !== -1; })
    .join(':');
}

function configureTls (tlsprofile) {
  return {
    key:     tlsprofile['private-key'],
    cert:    tlsprofile.certs.map(function(obj) { return obj.cert; }).filter(function(cert) { return cert['cert-type'] === 'CLIENT'; }), // Right?
    ca:      tlsprofile.certs.map(function(obj) { return obj.cert; }).filter(function(cert) { return cert['cert-type'] === 'PUBLIC'; }), // Right?
    ciphers: getCiphers(tlsprofile.ciphers),
    rejectUnauthorized: !!tlsprofile['mutual-auth']
  };
}

module.exports = configureTls;
