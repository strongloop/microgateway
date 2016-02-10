'use strict'

let forever = require('forever-monitor');

let child;
let server;
exports.start = function(fork) {
  return new Promise((resolve, reject) => {
    if (fork) {
      child = new (forever.Monitor)('./datastore/server/server.js', {
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
          child.removeAllListeners('message');
          resolve();
        }
      });

      child.start();
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

