// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var tls = require('tls');
var cipherMappings = require('../cipher-suites');

var availableCiphers = tls.getCiphers().map(
        function(c) { return c.toUpperCase(); });

function getCiphers (profileCiphers) {
  return profileCiphers
    .map(function(c) { return c.toUpperCase(); })
    .map(function(c) { return cipherMappings[c]; })
    .filter(function(c) { return availableCiphers.indexOf(c) !== -1; })
    .join(':');
}

function configureTls(options, tlsprofile) {
  var certList = [];
  var caList = [];

  for (var i in tlsprofile.certs) {
    var o = tlsprofile.certs[i];
    if (o && o['cert-type'] === 'PUBLIC')
      certList.push(o.cert);
    else if (o && o['cert-type'] === 'CLIENT')
      caList.push(o.cert);
  }

  options.key = tlsprofile['private-key'];
  options.cert = certList;
  options.ca = caList;
  options.ciphers = getCiphers(tlsprofile.ciphers);
  options.rejectUnauthorized = !!tlsprofile['mutual-auth'];
}

module.exports = configureTls;
