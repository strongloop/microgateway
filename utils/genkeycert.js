#!/usr/bin/env node

// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var pem = require('pem');
var fs = require('fs');
var path = require('path');

console.log('Generating self-signed certificate & key..');
pem.createCertificate({ selfSigned: true }, function(err, keys) {
  if (err) {
    console.log(err);
    return;
  }
  var certPath = path.resolve(__dirname, '../config/cert.pem');
  var keyPath = path.resolve(__dirname, '../config/key.pem');
  fs.writeFile(certPath, keys.certificate, function(e) {
    if (err) {
      console.error('Error when generating certificate: ' + e);
    } else {
      console.log('Certificate generated at: ' + certPath);
    }
  });

  fs.writeFile(keyPath, keys.serviceKey, function(e) {
    if (err) {
      console.error('Error when generating service key: ' + e);
    } else {
      console.log('Service key generated at: ' + keyPath);
    }
  });

});
