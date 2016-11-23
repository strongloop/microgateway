'use strict';

var _ = require('lodash');
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:api-matcher' });

/*
 * The "api-matcher" middlware selects the possible API candidates with the
 * criteria of method, path, etc. Once done, the candidates will be saved under
 * the context object.
 */
module.exports = function createApiMatcherMiddleware(options) {

  logger.debug('api-matcher middleware options: ', options);
  options = options || {};

  return function(req, res, next) {
    var dataStore = req.ctx.dataStore;

    //parse the incoming path first
    var parsedUrl = url.parse(req.url, true /* query string */);
    var segments = parsedUrl.pathname.split('/');
    var path = '';
    if (segments.length === 1) {
      path = '/';
    } else {
      for (var k = 1; k < segments.length; k++) {
        path += '/' + segments[k];
      }
    }

    dataStore.models.snapshot.getCurrentSnapshot()
      .then(function(ssid) {
        res.on('finish', function() {
          logger.debug('api-matcher released the snapshot:', ssid);
          dataStore.models.snapshot.releaseCurrentSnapshot(ssid);
        });
        return dataStore.models.api.matchRequest(ssid, req.method, path);
      })
      .then(function(apis) {
        req.ctx._apis = apis;
        next();
      })
      .catch(function(e) {
        next(e);
      });
  };
}
