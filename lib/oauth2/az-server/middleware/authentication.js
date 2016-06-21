// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');
var crypto = require('crypto');
var TokenError = require('../../errors/tokenerror');
var helper = require('../../oauth2-helper');
var basicAuth = require('../../../preflow/apim-security-basic').basicAuth;

var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth2:az-server:authentication'});

/**
 * Revoke the compromised credentials when client fails the authentication.
 *
 * It applies when the client tries to exchange an access token with an AZ code
 * or a refresh token. If the client cannot be authenticated, we delete the AZ
 * code or the refresh token that it presents.
 */
function removeCredential(models, grantType, credential) {
  if (!credential) {
    return;
  }

  logger.error('Authentication failed. Deleting the %s: %s',
          grantType, credential);

  if (grantType === 'refresh_token') {
    helper.deleteRefreshToken(models, credential, function(err, result) {
      if (err || !result || result.count === 0) {
        logger.error('Failed to delete the refresh token: ', err, result);
      } else {
        logger.debug('There is %d refresh toke deleted.', result.count);
      }
    });
  } else if (grantType === 'authorization_code') {
    helper.deleteAZCode(models, credential, function(err, result) {
      if (err || !result || result.count === 0) {
        logger.error('Failed to delete the authorization code: ', err, result);
      } else {
        logger.debug('There is %d authorization code deleted.', result.count);
      }
    });
  }
}

/**
 * Authenticate the client of a token request for MicroGateway.
 *
 * @return a Express middleware
 */
function clientAuthenticate(authCfg, models) {
  return function (req, res, next) {
    var client_id, client_secret;

    var parameters = req.ctx.request.parameters;

    var grantType = req.ctx.request.parameters.grant_type;
    var credential;
    if (grantType === 'refresh_token') {
      credential = req.ctx.request.parameters.refresh_token;
    } else if (grantType === 'authorization_code') {
      credential = req.ctx.request.parameters.code;
    }

    if (parameters.client_id && parameters.client_secret) {
      client_id = parameters.client_id;
      client_secret = crypto.createHash('sha256').
          update(parameters.client_secret).digest('base64');

      logger.debug('Found client_id and client_secret in the form data.');
    } else if (req.ctx.request.authorization) {
      var authHdr = req.ctx.request.authorization;
      if (authHdr.scheme !== 'Basic') {
        removeCredential(models, grantType, credential);
        return next(new TokenError(
                    'Unsupported authentication scheme', 'invalid_client'))
      }

      var authInfo =
          (new Buffer(authHdr.token, 'base64')).toString('utf-8').split(':');
      client_id = authInfo[0];
      client_secret = crypto.createHash('sha256').
          update(authInfo[1]).digest('base64');

      logger.debug('Found client_id and client_secret in the auth headers.');
    }

    if (!client_id && !client_secret) {
      logger.error('Cannot find client_id or client_secret in the request.');

      removeCredential(models, grantType, credential);
      return next(new TokenError(
                  'Missing required parameter: client_*', 'invalid_request'));
    }

    var snapshotId = req.ctx['config-snapshot-id'];
    //verify the client_secret
    var subid = req.ctx._.api['subscription-id'];
    models.clients.findById(snapshotId, client_id, req.ctx._.api.id,
      function(err, result) {
        if (result && result['client-secret'] == client_secret) {
          //Update the req.oauth2
          if (typeof req.oauth2 === 'object')
            _.extend(req.oauth2, result);
          else
            req.oauth2 = result;

          return next();
        }

        logger.error('Failed to authenticate the client.', client_id, err);
        removeCredential(models, grantType, credential);
        return next(new TokenError(
                      'Authentication error', 'invalid_client'));
    });
  };
}

/**
 * Authenticate the resource owner of a token request for MicroGateway.
 */
function userAuthenticate(snapshotId, authCfg, username, password, done) {
  var authObj = {
    scheme: 'Basic',
    token: new Buffer(username + ':' + password).toString('base64')
  };

  basicAuth(snapshotId, authCfg, authObj, function(error) {
    if (!error) {
      var user = { id: username };
      logger.debug('Resource owner %s has been authenticated for token request',
              username);
      return done(undefined, user);
    }
    else {
      return done(new TokenError(
                  'Failed to authenticate the resource owner',
                  'invalid_grant'));
    }
  });
}

module.exports = {
  clientAuthenticate: clientAuthenticate,
  userAuthenticate: userAuthenticate
};
