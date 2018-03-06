// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var fs = require('fs');
var path = require('path');
var YAML = require('yamljs');
var logger = require('apiconnect-cli-logger/logger.js')
                        .child({ loc: 'microgateway:index' });

var env = {
  NODE_ENV: 'production',
  APIMANAGER_CATALOG: '',
  APIMANAGER_PORT: 443,
  APIMANAGER_REFRESH_INTERVAL: 15 * 1000 * 60 };

try {
  var envPath = path.join(__dirname, '/env.yaml');
  if (!fs.existsSync(envPath)) {
    logger.warn('File not exist: env.yaml');
  } else {
    var envjson = YAML.load(envPath);
    Object.keys(envjson).forEach(function(k) {
      env[k] = envjson[k];
    });
  }
} catch (e) {
  logger.error('Fail to load environment variables: ', e);
}

Object.keys(env).forEach(function(k) {
  // Don't override env variables that were set explicitly
  if (typeof process.env[k] === 'undefined') {
    process.env[k] = env[k];
  }
});

// Should we do any extra sanity checks here?

require('./lib/microgw.js').start(process.env.PORT);
