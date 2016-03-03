'use strict';

/**
 * Module dependencies
 */
var dsc = require('../../datastore/client')
var logger = require('../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:cleanup'});

module.exports = function() { 
  return function cleanup(req, res, next) { 
    var snapshot = req.ctx['config-snapshot-id'];
    if (typeof snapshot === 'string') {
      logger.debug('releasing: ', snapshot);
      dsc.releaseCurrentSnapshot(snapshot);
    }
    next();
  };
};
