// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var path = require('path');
var pug = require('pug');

module.exports = function(config) {
  config = config || {};
  var page = config.page || path.resolve(__dirname, 'login-page.pug');
  var contentFn = pug.compileFile(page);

  return function(req, resp, next) {
    var oauth2 = req.oauth2;
    var ctx = req.ctx;
    if (oauth2.client.logined && oauth2.client.logined === true) {
      //already logined skip;
      next();
    } else {
      var options = {
        transaction_id: oauth2.transactionID,
        action: ctx.request.path + ctx.request.search,
        firstLogin: false };

      if (_.isUndefined(oauth2.client.logined)) {
        //first login
        oauth2.client.logined = false;
        options.firstLogin = true;
      }
      ctx.message.body = contentFn(options);
      //reset all headers
      ctx.message.headers = { 'Content-Type': 'text/html' };
      next('route');
    }
  };
};
