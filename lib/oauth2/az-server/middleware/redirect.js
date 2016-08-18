// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var os = require('os');
var _ = require('lodash');
var util = require('util');
var url = require('url');

var AuthorizationError = require('../../errors/authorizationerror');
var redirect = require('../../oauth2-helper').redirect;

module.exports = function(config) {
  var txParamName = config.txName || 'rstate';
  var redirectURL = config.redirectURL;
  var uri;

  try {
    uri = url.parse(redirectURL, true);
  } catch (e) {
    //ignore here, throw error for every transaction in the handler function;
  }

  return function(req, resp, next) {
    var ctx = req.ctx;
    var oauth2 = req.oauth2;

    if (_.isUndefined(redirectURL) || _.isUndefined(uri)) {
      throw new AuthorizationError('invalid redirect-url setting', 'server_error');
    };

    //no need to check if login or not, since the
    //redirect url control the stages of authentication and authorization
    var redirectQS = getRedirectQueryString(ctx, oauth2, req, txParamName);
    _.extend(redirectQS, uri.query);

    //TODO fragment support: #hash ??
    var obj = {};
    _.extend(obj, uri);
    obj.query = redirectQS;
    delete obj.search; delete obj.hash;
    redirect(ctx, url.format(obj));
    next('route');
  };
};

function getRedirectQueryString(ctx, oauth2, req, txName) {
  var scheme = req.connection.encrypted ? 'https' : 'http';
  var port = '';
  if ((scheme === 'https' && process.env.PORT !== 443) ||
       (scheme === 'http' && process.env.PORT !== 80)) {
    port = ':' + process.env.PORT;
  }
  var host = ctx.request.headers['host'] || os.hostname + port;

  var originalURL = util.format('%s://%s%s%s&%s=%s',
      scheme, host, ctx.request.path, ctx.request.search, txName, oauth2.transactionID);

  return {
    'original-url': originalURL,
    'app-name': oauth2.client.title };
}
