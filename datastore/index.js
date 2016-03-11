'use strict'

var Promise = require('bluebird');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore'});
var forever = require('forever-monitor');

var child;
var server;
var sigtermHandler = function() {
                       child.kill(true);
                       process.exit(0);
                     };

exports.start = function(fork) {
  return new Promise(function(resolve, reject) {
    if (fork) {
      child = new (forever.Monitor)('./datastore/server/server.js', {
        max: 10,
        args: [],
        fork: true,
        killTree: true,
      });

      child.on('restart', function() {
        logger.error('datastore restarting, count=' + child.times);
      });

      child.on('exit', function() {
        logger.error('datastore exited');
      });

      child.on('message', function(msg) {
        if (msg.DATASTORE_PORT) {
          process.env.DATASTORE_PORT = msg.DATASTORE_PORT;
        }
        if (msg.LOADED) {
          child.removeAllListeners('message');
          resolve(msg.https);
        }
      });

      child.on('stderr', function(data) {
        process.stderr.write(data);
      });

      child.on('stdout', function(data) {
        process.stdout.write(data);
      });

      child.start();

      process.on('SIGTERM', sigtermHandler);

    } else {
      process.send = function(msg) {
        if (msg.LOADED) {
          process.send = function() {};
          resolve();
        }
      };
      server = require('./server/server.js');
      server.start();
    }
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    if (child) {
      child.on('exit', function() {
        child = undefined; // reset child
        resolve();
      });
      child.stop();

      process.removeListener('SIGTERM', sigtermHandler);
    }
    if (server) {
      server.close(function() {
        server = undefined; // reset server
        resolve();
      });
    }
  });
};

