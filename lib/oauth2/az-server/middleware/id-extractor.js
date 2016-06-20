// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth:az-server:middleware:id-extract'});

var AuthorizationError = require('../../errors/authorizationerror');
var basicAuth = require('../../../preflow/apim-security-basic').basicAuth;

/**
 * this is used to extract user id from login. it also perform the authentication
 * by leveraging the 'apim-security-basic' module
 */
module.exports = function (options) {
  return function (req, res, next) {
    if (!options)
        return next({ name: 'ConfigurationError',
                      message: 'Bad configuration for user authentication' });

    var snapshotId = req.ctx['config-snapshot-id'];
    var authHdr = req.ctx.get('request.authorization') || redirect(req) || formData(req.ctx);
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
        if (typeof error === 'number') {
          req.ctx.set('error.status.code', 401);
          if (req.ctx.get('request.authorization')) {
            req.ctx.set('error.headers.WWW-Authenticate', 'Basic realm="apim"');
          }
        }
        return next( new AuthorizationError(
            'Failed to authenticate the user.' + error,
            'authentication_error'));
      }
    });
  };
};

/**
 * Get username and confirmation from query string for form data.
 * handle the case which is returned from redirect login
 * @param req
 * @returns
 */
function redirect(req) {
  var query = req.query;
  var body = req.ctx.request.body;

  var confirmation = query.confirmation || body.confirmation;
  var username = query.username || body.username;
  if (confirmation && username) {
    var token = 
      (new Buffer(username + ':' + confirmation))
      .toString('base64');
    return {
        scheme: 'Basic',
        token: token
    };
  }
}

/**
 * Get username and password from form data.
 * handle the cases which are returned from default login or custom login
 * @param ctx
 * @returns 
 */
function formData(ctx) {
  var username = ctx.request.body['j_username'] || ctx.request.body['username'];
  var passwd = ctx.request.body['j_password'] || ctx.request.body['password'];

  if (_.isUndefined(username) || _.isUndefined(passwd)) {
    return;
  }

  return {
      scheme: 'Basic',
      token: (new Buffer(username + ':' + passwd)).toString('base64')
  };
}
