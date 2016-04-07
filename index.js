// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var path = require('path');
var YAML = require('yamljs');

var env = {
  NODE_ENV: 'production',
  APIMANAGER_CATALOG: '',
  APIMANAGER_PORT: 0,
  APIMANAGER_REFRESH_INTERVAL: 15 * 1000 * 60,
  PORT: 5000
};

try {
  var envjson = YAML.load(path.join(__dirname, '/env.yaml'));
  Object.keys(envjson).forEach(function (k) {
    env[k] = envjson[k];
  });
}
catch (e) {
  // Would probably be good to log this somehow...
}

Object.keys(env).forEach(function (k) {
  // Don't override env variables that were set explicitly
  if (typeof process.env[k] === 'undefined')
    process.env[k] = env[k];
});

// Should we do any extra sanity checks here?

require('./lib/microgw.js').start(process.env.PORT);
