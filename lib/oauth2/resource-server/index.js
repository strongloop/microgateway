// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var models = require('../models');
var helpers = require('../oauth2-helper');
var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:resource-server'});
var dsc = require('../../../datastore/client');
var ResourceServer = require('./resource-server');

var validateClient = helpers.validateClient;
var clientInfo = helpers.clientInfo;

/**
 * Since passport, the strategies, and the resource server code are expecting
 * an Express-like request object but we only have access to the `ctx` object,
 * we need to rebuild a faux-request object that provides at least the
 * properties that could be needed
 *
 * @param ctx
 * @returns {{headers: *, get: header, header: header, body: *, query: *}}
 */
function reconstructRequest(ctx) {

  function header(name) {
    var lc = name.toLowerCase();

    switch (lc) {
      case 'referer':
      case 'referrer':
        return this.headers.referrer || this.headers.referer;
      default:
        return this.headers[lc];
    }
  }

  // TODO __might__ be faster to do lazy look-ups with getters
  return {
    headers: ctx.get('request.headers'),
    get:     header,
    header:  header,
    body:    ctx.get('request.body'),        // TODO does the body come out correctly?
    query:   ctx.get('request.querystring')  // TODO does the query string come out correctly?
  };
}

module.exports = function(config) {
  var oauthModels = new models.OAuthModels();

  return function(ctx, descriptor, securityReq, securityDef, filters, callback) {
    var req = reconstructRequest(ctx);
  };
};
