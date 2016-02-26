'use strict'

var loopback = require('loopback');
var boot = require('loopback-boot');
var async = require('async');
var fs = require('fs');
var environment = require('../../utils/environment');
var DATASTORE_PORT = environment.DATASTORE_PORT;
var CONFIGDIR = environment.CONFIGDIR;

// if the parent get killed we need to bite the bullet
process.on('disconnect', function() {
  process.exit(0);
});

var app = module.exports = loopback();

app.start = function() {
    // start the web server
    var server = app.listen(process.env.DATASTORE_PORT || 0, 
                            "localhost", 
    function() {
      app.emit('started');
      var baseUrl = app.get('url').replace(/\/$/, '');
      var port = app.get('port');
      process.env['DATASTORE_PORT'] = port;
      console.log('Web server listening at: %s port: %s', baseUrl, port);
      // save to file for explorer
      storeDatastorePort(port)
      // send to gateway
      process.send({'DATASTORE_PORT': port});

      if (app.get('loopback-component-explorer')) {
        var explorerPath = app.get('loopback-component-explorer').mountPath;
        console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
      }
    });
    app.close = function(cb) {
      server.close(cb);
    };
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});

function storeDatastorePort(port)
  {
  var path = 'datastore.config'
  if (process.env[CONFIGDIR])
    {
    path = process.env[CONFIGDIR] + '/' + path;
    }
  fs.writeFile(path, JSON.stringify({port: port}), 'utf8', function (err) {
    if (err) throw err;
    });
  }