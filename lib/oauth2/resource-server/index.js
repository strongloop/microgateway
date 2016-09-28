// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var models = require('../models');
var helpers = require('../oauth2-helper');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth:resource-server' });
var ResourceServer = require('./resource-server');
var STATUS_CODES = require('http').STATUS_CODES;


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
  var host = ctx.get('request.headers')['host'];
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
    headers: ctx.get('request.headers'),
    get: header,
    header: header,
    body: ctx.get('request.body'),
    query: ctx.get('request.querystring'),
    method: ctx.get('request.verb'),
    protocol: uriparts[0],
    originalUrl: uriparts[1].replace(host, ''),
    // FIXME the ctx never gets the HTTP version set
    httpVersion: '1.1' };
}

module.exports = function(config) {
  // TODO set realm!!!
  // TODO need to verify that these never need to be updated
  var oauthModels = models.getInstance(
      helpers.getDSDef(config.datasourceDef));
  var rs = ResourceServer(null, {}, oauthModels.models);

  return function(ctx, descriptor, securityReq, securityDef, callback) {
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
    var authenticators = rs.authenticate(function(err, info) {
      if (err || /Bearer realm/.test(info)) {
        err = err || {};
        err.code = err.code || 'invalid_token';
        err.status = err.status || 401;
        err.statusMessage = err.statusMessage || STATUS_CODES[err.status];

        ctx.set('error.type', 'oauth2:resource');
        ctx.set('error.status.code', err.status || 401);
        ctx.set('error.headers.WWW-Authenticate', 'Bearer error="' + err.code + '"');

        var body = {
          httpCode: '' + err.status,
          httpMessage: err.statusMessage,
          moreInformation: err.message || '' };

        ctx.set('error.body', body);

        return callback(false);
      }

      if (_.isBoolean(info)) {
        return callback(info);
      }

      //populate ctx variable for oauth2
      ctx.set('oauth',
        {
          'access-token': info.origToken,
          'resource-owner': info.resOwner,
          scope: info.accessToken.scopes.join(' '),
          'not-before': info.accessToken.issuedAt.toISOString(),
          'not-after': info.accessToken.expiredAt.toISOString(),
        }, true);

      callback(true);
    });

    if (_.isObjectLike(ctx.get('oauth'))) {
      //means the token is verified, no need to verify again
      return callback(true);
    }

    var req = reconstructRequest(ctx);
    req.oauth2 = { requiredScopes: _.get(_.toPairs(securityReq), '[0][1]') };
    var res = {};

    (function attempt(i) {
      if (i === authenticators.length) {
        return;
      }

      function next(err) {
        // This shouldn't ever happen...
        if (err) {
          logger.error(err);
          ctx.set('error.status.code', 500);
          callback(false);
          return;
        }
        attempt(i + 1);
      }

      authenticators[i](req, res, next);
    })(0);
  };
};
