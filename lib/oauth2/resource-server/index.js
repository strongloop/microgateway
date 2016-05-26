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


module.exports = function(config) {
  var oauthModels = new models.OAuthModels();

};
