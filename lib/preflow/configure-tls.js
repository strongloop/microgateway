'use strict';

const tls = require('tls');
const cipherMappings = require('../cipher-suites');

const availableCiphers = tls.getCiphers().map(c => c.toUpperCase());

function getCiphers (profileCiphers) {
  return profileCiphers
    .map(c => c.toUpperCase())
    .map(c => cipherMappings[c])
    .filter(c => availableCiphers.indexOf(c) !== -1)
    .join(':');
}

function configureTls (tlsprofile) {
  return {
    key:     tlsprofile['private-key'],
    cert:    tlsprofile.certs.map(obj => obj.cert).filter(cert => cert['cert-type'] === 'CLIENT'), // Right?
    ca:      tlsprofile.certs.map(obj => obj.cert).filter(cert => cert['cert-type'] === 'PUBLIC'), // Right?
    ciphers: getCiphers(tlsprofile.ciphers),
    rejectUnauthorized: !!tlsprofile['mutual-auth']
  };
}

module.exports = configureTls;
