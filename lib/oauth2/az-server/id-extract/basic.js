// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:az-server:id-extract:basic'});

var securityBasic = require('../../../preflow/apim-security-basic').evalBasic;

module.exports = function (options) {

  options = options || {};
  var securityDef = {
      type: 'basic',
  };

  var authentication = options.apidoc['x-ibm-configuration'].oauth2.authentication;

  _.extend(securityDef, authentication);

  return function (req, res, next) {
    //lets componse the security definition 
    //ctx, descriptor, securityReq, securityDef, filters, callback
    var ctx = req.ctx;
    securityBasic(
        ctx, 
        {'snapshot-id': ctx['config-snapshot-id']},
        undefined,  //securityReq
        securityDef,
        undefined,  //filters
        function (result) {
          if (result === false) {
            next({ name: 'BasicAuthFailed', message: 'Authorization Failed' });
          } else {
            //lets store user id under req.oauth2.user
            var tokens = 
                (new Buffer(req.ctx.request.authorization.token, 'base64'))
                    .toString().split(':');
            var user = {id: tokens[0]};
            req.oauth2.user = user;
            logger.debug('store request.oauth2.user:', user);
            next();
          }
        }
    );
  };
}
