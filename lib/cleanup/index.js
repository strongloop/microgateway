'use strict';

/**
 * Module dependencies
 */
var request = require('request');
var debug = require('debug')('micro-gateway:cleanup');

/**
 * Module globals
 */

var host = '127.0.0.1'; // data-store's listening interface
var port;               // data-store's listening port

module.exports = function() { 
  return function cleanup(err, req, res, next) { 
    var snapshot = req.ctx['config-snapshot-id'];
    if (typeof snapshot === 'string') {
      debug('releasing: ', snapshot);
      releaseCurrentSnapshot(snapshot, function(err){});
    }
    next();
  };
};

function releaseCurrentSnapshot(id, cb) {
  port = process.env['DATASTORE_PORT'];
  debug('releaseCurrentSnapshot entry');
  // build request to send to data-store
  var queryurl = 'http://' + host + ':' + port +
    '/api/snapshots/release?id=' + id;

  // send request to optimizedData model from data-store
  // for matching API(s)
  request(
    {
      url : queryurl
    },
    function (error, response, body) {
      debug('error: ', error);
      debug('body: %j' , body);
      debug('response: %j' , response);
      // exit early on error
      if (error) {
      	debug('releaseCurrentSnapshot error');
        cb(error);
        return;
      }
      debug('release id: ', id);
      debug('releaseCurrentSnapshot exit');
      cb(null);
    }
  );
}

