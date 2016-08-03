// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var path = require('path');
var pug = require('pug');
var _ = require('lodash');
var AuthorizationError = require('../../errors/authorizationerror');

module.exports = function(config) {
  config = config || {};
  var server = config.server;
  var page = config.page || path.resolve(__dirname, 'consent-form.pug');
  var contentFn = pug.compileFile(page);
  if (_.isUndefined(config.consentAgain)) {
    config.consentAgain = false;
  }

  return function(req, resp, next) {
    if (req.oauth2.res && req.oauth2.res.allow === true &&
        config.consentAgain === false) {
      server._respond(req.oauth2, req.ctx, function(err) {
        if (err && err !== 'route') {
          return next(new AuthorizationError(
              'Found errors in the server response handler',
              'server_error'));
        }
        return next();
      });
    } else {
      var oauth2 = req.oauth2;
      var ctx = req.ctx;
      var actionURI = ctx.request.path + ctx.request.search;
      //need to encode the values of inputs with urlencode
      //transactionID is already url-safe, therefore, skip it
      ctx.message.body = contentFn(
          { transaction_id: oauth2.transactionID,
            action: actionURI,
            client_title: oauth2.client.title,
            resource_owner: oauth2.user.id,
            redirect_uri: oauth2.redirectURI,
            original_url: actionURI,
            client_id: oauth2.req.clientID,
            scope: oauth2.req.scope,
            scopeStr: oauth2.req.scope.join(' '),
            dp_data: '' });
      //reset all headers
      ctx.message.headers = { 'Content-Type': 'text/html' };
      next('route');
    }
  };
};
