// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*eslint-env node */

var env  = require('./environment');
var path = require('path');
var fs   = require('fs');
var log  = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:utils'});

exports.getTLSConfigSync = function() {
  var rev;
  var cfg = process.env[env.TLS_SERVER_CONFIG] ? 
      //the env value should be a relative path to parent directory
      path.resolve(__dirname, '..', process.env[env.TLS_SERVER_CONFIG]) :
      path.resolve(__dirname, '..', 'config', 'defaultTLS.json');

  try {
    rev = JSON.parse(fs.readFileSync(cfg));
    var baseDir = path.dirname(cfg); //base dir, used for relative path
    var props = Object.keys(rev);    //property names
    for (var index = 0, length = props.length; index < length; index++) {
      var propName = props[index];
      if (rev[propName] instanceof Array) {
        var values = rev[propName];
        var newValues = [];
        for (var valueIndex = 0, valueLength = values.length;
            valueIndex < valueLength; valueIndex++) {

          newValues.push(fs.readFileSync(path.resolve(baseDir,values[valueIndex])));
        }
        rev[propName] = newValues;
      } else {
        rev[propName] = fs.readFileSync(path.resolve(baseDir, rev[propName]));
      }
    }
  } catch (e) {
    log.error(e);
  }

  return rev;
};