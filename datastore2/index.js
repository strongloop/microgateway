'use strict';

var Promise = require('bluebird');
var forever = require('forever-monitor');
var path = require('path');

var child;

function forkDataStore() {
  return new Promise(function(resolve, reject) {
    var resolved = false;
    child = new (forever.Monitor)(path.resolve(__dirname, 'server/server.js'), {
      max: 10,
      args: [],
      fork: true,
      killTree: true,
    });

    child.on('restart', function() {
      logger.debug('datastore restarting, count=' + child.times);
    });

    child.on('exit', function() {
      logger.debug('datastore exited');
    });

    child.on('message', function(msg) {
      if (!resolved && msg.loaded) {
        resolved = true;
        process.env.DATASTORE_PORT = msg.DATASTORE_PORT;
        resolve();
      }
    });

    child.on('stderr', function(data) {
      process.stderr.write(data);
    });

    child.on('stdout', function(data) {
      process.stdout.write(data);
    });

    child.on('disconnect', function() {
      logger.exit(2);
    });
    child.start();
  });
}

exports.start = function(fork) {
  if (fork) {
    return forkDataStore();
  } else {
    var server = require('./server/server.js');
    return server.start();
  }
}

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    if (child) {
      child.on('exit', function() {
        child = undefined; // reset child
        resolve();
      });
      child.stop();
    } else {
      resolve();
    }
  });
};
