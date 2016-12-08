// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
         .child({ loc: 'microgateway:datastore:server:server' });
var express = require('express')
var DataStore = require('./store.js');

// if the parent get killed we need to bite the bullet
process.on('disconnect', function() {
  logger.exit(0);
});

var app = module.exports = express();
var port = process.env.DATASTORE_PORT || 5555;
var dataStore = new DataStore({ port: port, app: app });

function loadData(dataStore) {
  console.log('loadData: ' + process.env.CONFIG_DIR)
  if (process.env.CONFIG_DIR) {
    var FilePuller = require('../datahandler/file-puller');
    var puller = new FilePuller(process.env.CONFIG_DIR);
    return puller.run(dataStore);
  } else {
    console.log('Environment variable CONFIG_DIR not set yet');
  }
}

app.start = function() {
  return loadData(dataStore).then(function() {
    var server = app.listen(port, '0.0.0.0', function() {
      process.env.DATASTORE_PORT = port;
      logger.debug('DataStore server listening on port: %s', port);

      loadData(dataStore)
      .then(function() {
        // send to gateway
        process.send({ loaded: true, DATASTORE_PORT: port });
      })
      .catch(function(e) {
        process.send({ loaded: false, error: e });
      });

    });

    app.close = function(cb) {
      server.close(cb);
    };
  })
};

// start the server if `$ node server.js`
if (require.main === module) {
  app.start();
}
