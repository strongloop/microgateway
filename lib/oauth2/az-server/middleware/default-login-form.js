// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var fs = require('fs');
var path = require('path');
var pug = require('pug');

module.exports = function (config) {
  config = config || {};
  var page = config.page || path.resolve(__dirname, 'login-page.pug');
  var contentFn = pug.compileFile(page);

  return function (req, resp, next) {
    var oauth2 = req.oauth2;
    var ctx = req.ctx;
    if (oauth2.client.logined && oauth2.client.logined === true) {
      //already logined skip;
      next();
    } else {
      oauth2.client.logined = false;
      ctx.message.body = contentFn({transaction_id: oauth2.transactionID,
          action: ctx.request.path + ctx.request.search});
      //reset all headers
      ctx.message.headers = {'Content-Type': 'text/html'};
      next('route'); 
    }
  };
};
