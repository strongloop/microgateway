var forever = require('forever-monitor');

exports.start = function(fork, cb) {
  if (fork) {
    var child = new (forever.Monitor)('./datastore/server/server.js', {
      max: 10,
      args: [],
      fork: true
    });

    child.on('restart', function() {
      console.error('datastore restarting, count=' + child.times);
    });

    child.on('exit', function() {
      console.error('datastore failed to start');
    });

    child.on('message', function(msg) {
      if (msg.DATASTORE_PORT) {
        process.env.DATASTORE_PORT = msg.DATASTORE_PORT;
      }
      if (msg.LOADED) {
        cb();
      }
    });

    child.start();
  } else {
    process.send = function(msg) {
      if (msg.LOADED) {
        cb();
      }
    };
    var ds = require('./server/server.js');
    ds.start();
  }
};
