// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var os = require('os');
var _ = require('lodash');
var util = require('util');

var OAuth2Error = require('../../errors/oauth2error');
var redirect = require('../../oauth2-helper').redirect;

module.exports = function (config) {
  var redirectURL = config.redirectURL;
  if (_.isUndefined(redirectURL)) {
    throw new OAuth2Error('invalid redirect-url', 'server_error');
  };

  return function(req, resp, next) {
    var ctx = req.ctx;
    var oauth2 = req.oauth2;

    //no need to check if login or not, since the
    //redirect url control the stages of authentication and authorization
    redirect(ctx, 
        redirectURL + '?' + getRedirectQueryString(ctx, oauth2, req));
    next('route');
  };
};

function getRedirectQueryString(ctx, oauth2, req) {
  var scheme = req.connection.encrypted ? 'https' : 'http';
  var port = '';
  if ((scheme === 'https' && process.env.PORT !== 443) || 
       (scheme === 'http' && process.env.PORT !== 80)) {
    port = ':' + process.env.PORT;
  }
  var host = ctx.request.headers['host'] || os.hostname + port;

  var originalURL = encodeURIComponent(
      util.format('%s://%s%s%s&dp-state=%s',
      scheme,
      host,
      ctx.request.path,
      ctx.request.search,
      oauth2.transactionID));

  return util.format('original-url=%s&app-name=%s', 
          originalURL, 
          encodeURIComponent(oauth2.client.title));
}
