/*
 * Remove org/cat from the URI
 */
'use strict';
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:urlrewrite'});
var environment = require('../../utils/environment');

module.exports = function createURLRewriteMiddleware(options) {
  return function urlrewrite(req, res, next) {
    if (process.env[environment.BASEURI]) {  // only rewrite when WPLN_APP_ROUTE is specified
      logger.debug("In the urlrewrite, remove org and cat short names");
      try {
        var route = url.parse(process.env.WLPN_APP_ROUTE);
        var regexp = new RegExp('^' + route.pathname);
        req.url = req.url.replace(regexp, ''); // strip out /org/cat from beginning of URI
      } catch (e) {
        logger.error(e);
      }


    }
    next();
  }
};

