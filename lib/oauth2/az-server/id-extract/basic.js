// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:az-server:id-extract:basic'});

var basicAuth = require('../../../preflow/apim-security-basic').basicAuth;

module.exports = function (options) {
  return function (req, res, next) {
    if (!options)
        return next({ name: 'ConfigurationError',
                      message: 'Bad configuration for user authentication' });

    var snapshotId = req.ctx['config-snapshot-id'];
    var authHdr = req.ctx.get('request.authorization') || formData(req.ctx);
    var authCfg = options.apidoc['x-ibm-configuration'].oauth2.authentication;

    basicAuth(snapshotId, authCfg, authHdr, function(error) {
      if (!error) {
        //let's store the username under req.oauth2.user
        var tokens =
            (new Buffer(authHdr.token, 'base64'))
                .toString().split(':');
        var user = { id: tokens[0] };
        req.oauth2.user = user;
        req.oauth2.client.logined = true;
        logger.debug('store request.oauth2.user:', user);

        return next();
      }
      else {
        logger.error('Failed to extract identification (basic auth).');
        return next({ name: 'Authentication error',
                      message: 'Failed to authenticate the user. ' + error });
      }
    });
  };
};

function formData(ctx) {
  var username = ctx.request.body['j_username'];
  var passwd = ctx.request.body['j_password'];
  var token = (new Buffer(username + ':' + passwd)).toString('base64');
  return {
      scheme: 'Basic',
      token: token
  };
}
