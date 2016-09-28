// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth:az-server:middleware:id-extract' });

var AuthorizationError = require('../../errors/authorizationerror');
var basicAuth = require('../../../security-check/eval-basic').basicAuth;

/**
 * this is used to extract user id from login. it also perform the authentication
 * by leveraging the 'eval-basic' module
 */
module.exports = function(options) {
  var isForm = options.form === true || false;
  var loginRender = options.loginRender;
  ///< login attempt limitation, 0 is unlimited
  var retryCount = 3; //default login attempt limitation
  if (!_.isUndefined(options.retryCount)) {
    retryCount = options.retryCount;
  }

  return function(req, res, next) {
    if (!options) {
      return next({ name: 'ConfigurationError',
                    message: 'Bad configuration for user authentication' });
    }

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
      } else {
        req.oauth2.client.loginCount = (req.oauth2.client.loginCount || 0) + 1;
        logger.error('Failed to extract identification (basic auth).', error);
        if (error.statusCode === 401) {
          req.ctx.set('error.status.code', 401);
          if (!isForm) {
            req.ctx.set('error.headers.WWW-Authenticate', 'Basic realm="apim"');
          }
        } else {
          req.ctx.set('error.status.code', 403);
        }

        if (loginRender &&
            (!retryCount || req.oauth2.client.loginCount < retryCount)) {
          //re-render login form
          return loginRender(req, res, next);
        } else {
          req.oauth2.client.loginCount = 0;
          return next(new AuthorizationError(
              'Failed to authenticate the user.',
              'authentication_error'));
        }
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
    var token = (new Buffer(username + ':' + confirmation)).toString('base64');
    return { scheme: 'Basic', token: token };
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
    token: (new Buffer(username + ':' + passwd)).toString('base64') };
}
