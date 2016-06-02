// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var crypto = require('crypto');
var TokenError = require('../../errors/tokenerror');
var basicAuth = require('../../../preflow/apim-security-basic').basicAuth;

var logger = require('apiconnect-cli-logger/logger.js')
    .child({loc: 'microgateway:oauth2:az-server:authentication'});

/**
 * Authenticate the client of a token request for MicroGateway.
 *
 * @return a Express middleware
 */
function clientAuthenticate(authCfg, models) {
  return function (req, res, next) {
    //TODO: check if the scopes are valid?
    var client_id, client_secret;

    var parameters = req.ctx.request.parameters;
    if (parameters.client_id && parameters.client_secret) {
      client_id = parameters.client_id;
      client_secret = crypto.createHash('sha256').
          update(parameters.client_secret).digest('base64');

      logger.debug('Found client_id and client_secret in the form data.');
    } else if (req.ctx.request.authorization) {
      var authHdr = req.ctx.request.authorization;
      if (authHdr.scheme !== 'Basic') {
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
      logger.error('Cannot find client_id and client_secret in the request.');

      return next(new TokenError(
                  'Missing required parameter: client_*', 'invalid_client'));
    }

    var snapshotId = req.ctx['config-snapshot-id'];
    var apiId = req.ctx._.api.id;
    //verify the client_secret
    models.clients.findById(snapshotId, client_id, apiId,
      function(err, result) {
        if (!err && result && result.length > 0) {
          var expect = result[0]['client-secret'];
          if (client_secret === expect) {
            logger.debug(
                    'client %s has been authenticated for token request',
                    client_id);

            //Update the req.oauth2
            req.oauth2 = { 'id': client_id,
                           'client-id': client_id,
                           'client-secret': client_secret,
                           'title': result[0]['client-name'] };
            return next();
          }
        }

        logger.error('Failed to authenticate the client.', err, result);
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
      logger.debug('Resource owner %s has been authenticated for token request',
              username);
      return done(undefined, username);
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
