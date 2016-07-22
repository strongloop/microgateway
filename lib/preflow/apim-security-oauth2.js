// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

//var dsc = require('../../datastore/client');
//var logger = require('apiconnect-cli-logger/logger.js')
//               .child({loc: 'microgateway:preflow:apim-security-oauth2'});

var evalOauth2 = require('../oauth2/resource-server')({});

module.exports = {
  evalOauth2: evalOauth2
};

