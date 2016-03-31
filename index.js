// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var ENV_IGNORE = '#';
var env = {
  NODE_ENV: 'production',
  APIMANAGER: '127.0.0.1',
  APIMANAGER_CATALOG: '',
  APIMANAGER_PORT: 0,
  APIMANAGER_REFRESH_INTERVAL: 15 * 1000 * 60,
  PORT: 5000
};

try {
  var envjson = require('./env.json');
  Object.keys(envjson).forEach(function (k) {
    if (k.indexOf(ENV_IGNORE) === -1)
      env[k] = envjson[k];
  });
}
catch (e) {
  // Would probably be good to log this somehow...
}

Object.keys(env).forEach(function (k) {
  process.env[k] = env[k];
});

// Should we do any extra sanity checks here?

require('./lib/microgw.js').start(process.env.PORT);
