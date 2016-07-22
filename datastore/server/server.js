// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var loopback = require('loopback');
var boot = require('loopback-boot');
var logger = require('apiconnect-cli-logger/logger.js')
         .child({ loc: 'microgateway:datastore:server:server' });
var storeDataStorePort = require('../common/utils/utils').storeDataStorePort;

// if the parent get killed we need to bite the bullet
process.on('disconnect', function() {
  logger.exit(0);
});

var app = module.exports = loopback();

app.start = function() {
  // start the web server
  var server = app.listen(process.env.DATASTORE_PORT || 0, '0.0.0.0', function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    var port = app.get('port');
    process.env.DATASTORE_PORT = port;
    logger.debug('Web server listening at: %s port: %s', baseUrl, port);
    // save to file for explorer
    storeDataStorePort(port);
    // send to gateway
    process.send({ DATASTORE_PORT: port });

    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      logger.debug('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });

  app.close = function(cb) {
    server.close(cb);
  };
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) {
    throw err;
  }

  // start the server if `$ node server.js`
  if (require.main === module) {
    app.start();
  }
});
