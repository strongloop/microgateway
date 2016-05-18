// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';
var models = require('../models');

module.exports = function(config) {
  return function(req, res, next) {
    next();
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
