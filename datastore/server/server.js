'use strict'

var loopback = require('loopback');
var boot = require('loopback-boot');
var async = require('async');
var environment = require('../../utils/environment');
var DATASTORE_PORT = environment.DATASTORE_PORT;

// if the parent get killed we need to bite the bullet
process.on('disconnect', function() {
  process.exit(0);
});

var app = module.exports = loopback();

app.start = function() {
  async.series([
  function(callback) {
    environment.getVariable(
      DATASTORE_PORT,
      function(value) {
        if (value) {
          app.set('port', value);
        }
      },
      callback
    );
  },
  function(callback) {
    // start the web server
    var server = app.listen(process.env.DATASTORE_PORT || 0, function() {
      app.emit('started');
      var baseUrl = app.get('url').replace(/\/$/, '');
      var port = app.get('port');
      process.env['DATASTORE_PORT'] = port;
      console.log('Web server listening at: %s port: %s', baseUrl, port);
      process.send({'DATASTORE_PORT': port});

      if (app.get('loopback-component-explorer')) {
        var explorerPath = app.get('loopback-component-explorer').mountPath;
        console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
      }
    });
    app.close = function(cb) {
      server.close(cb);
    };
  }]);
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function(err) {
  if (err) throw err;

  // start the server if `$ node server.js`
  if (require.main === module)
    app.start();
});
