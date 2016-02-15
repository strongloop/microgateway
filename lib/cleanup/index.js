'use strict';

/**
 * Module dependencies
 */
var dsc = require('../../datastore/client')
var debug = require('debug')('micro-gateway:cleanup');

module.exports = function() { 
  return function cleanup(req, res, next) { 
    var snapshot = req.ctx['config-snapshot-id'];
    if (typeof snapshot === 'string') {
      debug('releasing: ', snapshot);
      dsc.releaseCurrentSnapshot(snapshot);
    }
    next();
  };
};
