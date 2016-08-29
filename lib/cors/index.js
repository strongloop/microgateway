// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*
 * Prepare the CORS headers, and process the preflight requests.
 */
'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:cors' });

module.exports = function createCorsMiddleware(options) {
  logger.debug('CORS middleware options: ', options);
  options = options || {};

  return function(req, res, next) {
    var target = req.ctx._apis;
    var allowMethods = target.allowMethods;
    var isPreflight = target.isPreflight;

    if (isPreflight || allowMethods !== '') {
      logger.info('CORS setting up the headers...');

      var allowedOrigin = req.headers.origin ? req.headers.origin : '*';
      res.setHeader('access-control-allow-origin', allowedOrigin);
      res.setHeader('access-control-allow-credentials', allowedOrigin === '*' ? 'false' : 'true');
      res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '');
      res.setHeader('access-control-allow-methods', allowMethods);
      res.setHeader('access-control-expose-headers',
            'APIm-Debug-Trans-Id, X-RateLimit-Limit, X-RateLimit-Remaining, '
            + 'X-RateLimit-Reset, X-Global-Transaction-ID');
    }

    //skip the following middlwares for preflight requests.
    if (target.isPreflight) {
      logger.info('cors: the preflight request is done');
      res.end();
      return;
    }

    next();
  };
};

