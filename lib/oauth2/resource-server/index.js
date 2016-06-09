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

  var host     = ctx.get('request.headers')['host'];
  var uriparts = ctx.get('request.uri').split('://');

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
  // TODO probably need to mimic `passport`'s monkey patch on `http.IncomingMessage`
  return {
    headers:     ctx.get('request.headers'),
    get:         header,
    header:      header,
    body:        ctx.get('request.body'),
    query:       ctx.get('request.querystring'),
    method:      ctx.get('request.verb'),
    protocol:    uriparts[0],
    originalUrl: uriparts[1].replace(host, ''),
    httpVersion: '1.1'  // FIXME the ctx never gets the HTTP version set
  };
}

module.exports = function(config) {
  // TODO set realm!!!
  // TODO need to verify that these never need to be updated
  var oauthModels = models.getInstance(config.datasourceDef);
  var rs = ResourceServer(null, {}, oauthModels.models);

  return function(ctx, descriptor, securityReq, securityDef, filters, callback) {
    /*
      securityDef: {
        "type": "oauth2",
        "authorizationUrl": "http://swagger.io/api/oauth/dialog",
        "flow": "implicit",
        "scopes": {
          "write:pets": "modify pets in your account",
          "read:pets": "read your pets"
        }
      }

      securityReq: {
        "petstore_auth": [
          "write:pets",
          "read:pets"
        ]
      }
    */
    var authenticators = rs.authenticate(function (err, user) {
      if (err) {
        // TODO I think need to set an error param?
        ctx.set('error.status.code', err.status || 400); // FIXME why isn't this ho
        return callback(false);
      }
      callback(!!user);
    });
    var req = reconstructRequest(ctx);
    var res = {};

    (function attempt(i) {
      if (i === authenticators.length) {
        // TODO under what circumstances do we get here?
        logger.debug('All OAuth2 resource server "middleware" have been run.');
        callback(false); // TODO ???
        return;
      }

      function next (err) {
        if (err) {
          logger.error(err);
          ctx.set('error.status.code', 500);
          callback(false);
          return;
        }
        attempt(i+1);
      }

      authenticators[i](req, res, next);
    })(0);
  };
};
