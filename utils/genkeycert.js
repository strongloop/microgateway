#!/usr/bin/env node

// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var pem = require('pem');
var fs = require('fs');
var path = require('path');

var keyPath = path.resolve(__dirname, '../config/key.pem');
var certPath = path.resolve(__dirname, '../config/cert.pem');

function checkServiceKey(cb) {
  try {
    fs.statSync(keyPath);
    var serviceKey = fs.readFileSync(keyPath);
    cb(null, serviceKey);
  } catch (e) {
    if (e.code === 'ENOENT') {
      // if key.pem not exist, generate the private key
      console.log("Create the service key 'config/key.pem'");
      pem.createPrivateKey(2048, function(e, keyData) {
        if (e) {
          cb(e);
        } else {
          fs.writeFile(keyPath, keyData.key, function(e) {
            cb(e, e || { newKey: true, keyData: keyData.key });
          });
        }
      });
    } else {
      cb(e);
    }
  }
}

function createCertificate(keyData, cb) {
  pem.createCertificate({ serviceKey: keyData }, function(e, certResult) {
    if (e) {
      cb(e);
    } else {
      fs.writeFile(certPath, certResult.certificate, cb);
    }
  });
}

function createCertificateCB(err) {
  if (err) {
    console.log("Error when creating the cert file 'config/cert.pem': " + err);
    process.exit(1);
  }
}

checkServiceKey(function(err, result) {
  if (err) {
    console.log("Error when checking/creating the service key file 'config/key.pem': " + err);
    process.exit(1);
  }
  var certFileExist = false;
  try {
    fs.statSync(certPath);
    certFileExist = true;
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.log("Error when checking the cert file 'config/cert.pem': " + e);
      process.exit(1);
    }
  }
  if (certFileExist) {
    if (result.newKey) {
      console.log("Recreate the cert file 'config/cert.pem'");
      createCertificate(result.keyData, createCertificateCB);
    }
  } else {
    console.log("Create the cert file 'config/cert.pem'");
    createCertificate(result.keyData, createCertificateCB);
  }
});
