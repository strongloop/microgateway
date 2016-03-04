'use strict'

var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore'});
let forever = require('forever-monitor');

let child;
let server;
exports.start = function(fork) {
  return new Promise((resolve, reject) => {
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
          resolve();
        }
      });

      child.on('stderr', function(data) {
        process.stderr.write(data);
      });

      child.on('stdout', function(data) {
        process.stdout.write(data);
      });

      child.start();

      process.on('SIGTERM', function() {
        child.kill(true);
        process.exit(0);
      });

    } else {
      process.send = function(msg) {
        if (msg.LOADED) {
          process.send = () => {};
          resolve();
        }
      };
      server = require('./server/server.js');
      server.start();
    }
  });
};

exports.stop = function() {
  return new Promise((resolve, reject) => {
    if (child) {
      child.stop();
      resolve();
    }
    if (server) {
      server.close(() => {
        resolve();
      });
    }
  });
};

