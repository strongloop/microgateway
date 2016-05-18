// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var models = require('../models');
var helpers = require('../oauth2-helper');
var uid = require('uid2');
var oauth2Provider = require('./oauth2orize');

/*
 * config should contains:
 * - app : the express application
 */
module.exports = function(config) {

  //we decide to use JWT as the token format
  var generateToken = config.generateToken || generateJTWToken;

  return function(req, res, next) {
    next();
  };
};

function generateJTWToken(options) {
  options = options || {};
  var id = uid(32);
  var secret = options.client.clientSecret;
  var payload = {
    id: id,
    clientId: options.client.id,
    userId: options.user && options.user.id,
    scope: options.scope,
    createdAt: new Date()
  };

  var token = helpers.generateJWT(payload, secret, 'HS256');
  return {
    id: token
  };
};

if (require.main === module) {
  var models = new models.OAuthModels();
  
  //clientId, token, userId, scopes
  models.createToken('clientA', 'token1', 'userid1', ['scope1']);
  models.createToken('clientB', 'token2', 'userid2', ['scope2']);
  models.createToken('clientB', 'token3', 'userid2', ['scope1']);
  
  models.getTokenByClientId('clientA', function (error, tokenObj) {
    console.error('token record:', tokenObj);
  });
}