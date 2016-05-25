// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var securityBasic = require('../../../preflow/apim-security-basic');
var _ = require('lodash');

module.exports = function (options) {

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
          console.error('result of apim-security-basic', result);
          next();
        }
    );
  };
}