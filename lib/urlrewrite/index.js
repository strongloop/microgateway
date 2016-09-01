// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

/*
 * Remove org/cat from the URI
 */
'use strict';
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:urlrewrite' });

module.exports = function createURLRewriteMiddleware(options) {
  return function urlrewrite(req, res, next) {
    if (process.env.WLPN_APP_ROUTE) {  // only rewrite when WPLN_APP_ROUTE is specified
      logger.debug('In the urlrewrite, remove org and cat short names');
      try {
        var route = url.parse(process.env.WLPN_APP_ROUTE);
        var regexp = new RegExp('^' + route.pathname);
        req.url = req.url.replace(regexp, ''); // strip out /org/cat from beginning of URI
      } catch (e) {
        logger.error(e);
      }
    }

    next();
  };
};

