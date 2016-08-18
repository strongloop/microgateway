// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var loopback = require('loopback');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth2:models' });
var _ = require('lodash');

var dsc = require('../../../datastore/client');
var helpers = require('../oauth2-helper');

/*
 * json files for model definitions
 */
var defs = {
  OAuthAuthorizationCode: require('../common/models/oauth-authorization-code.json'),
  OAuthPermission: require('../common/models/oauth-permission.json'),
  OAuthScopeMapping: require('../common/models/oauth-scope-mapping.json'),
  OAuthScope: require('../common/models/oauth-scope.json'),
  OAuthAccessToken: require('../common/models/oauth-access-token.json'),
  OAuthRefreshToken: require('../common/models/oauth-refresh-token.json') };

/**
 * create a loopback application, OAuth data models, attach data models to
 * connector and also the loopback application
 */
function OAuthModels(config) {
  config = config || {};
  var dataSourceDef = config.dataSource ||
      { name: 'microgw-oauth-db', connector: 'memory' };

  this.dbName = dataSourceDef.name;

  this.app = loopback();
  this.ds = this.app.dataSource(this.dbName, dataSourceDef);
  this.dataModels = {};
  var modelNames = Object.getOwnPropertyNames(defs);
  for (var index = 0, len = modelNames.length; index < len; index++) {
    var name = modelNames[index];
    this.dataModels[name] = loopback.createModel(defs[name]);
    this.app.model(this.dataModels[name], { dataSource: this.ds });
  }

  //initialize models, rewrap the data models with utility functions
  initialize(this, config);
};

function findByDatasource(datasource) {
  var datasources = Object.getOwnPropertyNames(sInstances);
  for (var index = 0, len = datasources.length; index < len; index++) {
    var nameObj = datasources[index];
    if (_.isEqual(nameObj, datasource)) {
      return sInstances[nameObj];
    }
  }
  return null;
}

function initialize(oauthModels, options) {
  var dataModels = oauthModels.dataModels;

  var oAuthAccessTokenModel = dataModels.OAuthAccessToken;
  var oAuthRefreshTokenModel = dataModels.OAuthRefreshToken;
  var oAuthAuthorizationCodeModel = dataModels.OAuthAuthorizationCode;
  var oAuthPermissionModel = dataModels.OAuthPermission;

  var clients = {};
  clients.find = function(snapshotId, subscriptionId, clientId, done) {
    logger.debug('clients.find(', clientId, ')');
    dsc.getAppInfo(snapshotId,
        subscriptionId,
        clientId,
        done);
  };

  clients.findById = function(snapshotId, clientId, apiId, done) {
    logger.debug('clients.findById(', clientId, ')');
    dsc.getClientCredsById(snapshotId,
        clientId,
        apiId,
        done);
  };

  var accessToken = {};
  accessToken.find = function(apiId, id, done) {
    logger.debug('accessToken.find(<id>)');
    oAuthAccessTokenModel.findOne(
      { where: { id: id } },
      function(err, result) {
        if (!result || _.isUndefined(result.id) ||
          result.apiId !== apiId) {
          return done(err);
        }
        done(err, result);
      }
    );
  };

  accessToken.findById = function(id, done) {
    logger.debug('accessToken.findById(<id>)');
    oAuthAccessTokenModel.findOne(
        { where: { id: id } },
        function(err, result) {
          if (result && _.isUndefined(result.id)) {
            return done(err);
          }
          return done(err, result);
        });
  };

  accessToken.findByRefreshToken = function(id, done) {
    logger.debug('accessToken.findByRefreshToken(<id>)');
    oAuthAccessTokenModel.findOne(
        { where: { refreshToken: id } },
        function(err, result) {
          if (result && _.isUndefined(result.id)) {
            return done(err);
          }
          return done(err, result);
        });
  };

  accessToken.deleteByRefreshToken = function(clientId, id, done) {
    logger.debug('accessToken.deleteByRefreshToken(', clientId, ',<id>)');
    var where = {
      appId: clientId,
      refreshToken: id };
    oAuthAccessTokenModel.destroyAll(where, done);
  };

  accessToken.delete = function(clientId, id, tokenType, done) {
    logger.debug('accessToken.delete(', clientId, ',<id>,', tokenType, ')');
    var where = { appId: clientId };
    if (tokenType === 'access_token') {
      where.id = id;
    } else {
      where.refreshToken = id;
    }
    oAuthAccessTokenModel.destroyAll(where, done);
  };

  accessToken.purge = function() {
    var where = {
      expiredAt: { lte: new Date() } };

    oAuthAccessTokenModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the access tokens.', error);
        return;
      }
      logger.debug('%d expired access tokens are purged', result.count);
    });
  };

  accessToken._save = function(apiId, clientId, userId, scopes,
          id, rTknId, secret, iat, exp, grant, azCode, done) {
    var tokenObj = {
      id: id,
      apiId: apiId,
      appId: clientId,
      userId: userId,
      secret: secret,
      grant: grant,
      scopes: scopes,
      authorizationCode: azCode,
      refreshToken: rTknId,
      tokenType: 'Bearer',
      issuedAt: new Date(iat),
      expiredAt: new Date(exp),
      expiresIn: (exp - iat) / 1000 };

    logger.debug('An access token is created: %j', tokenObj);
    oAuthAccessTokenModel.create(tokenObj, done);
  };

  /**
   * Will save the access token and its optional refresh token together.
   *
   * @aTknOption: should contain the id, secret, expire, azCode
   * @rTknOption: should contain the id, secret, countDown, expire
   */
  accessToken.save = function(apiId, clientId, userId, scopes, grant,
          aTknOption, rTknOption, done) {
    if (rTknOption) {
      refreshToken._save(apiId, clientId, userId, scopes,
        rTknOption.id, rTknOption.secret, rTknOption.countDown,
        rTknOption.issuedAt, rTknOption.expiredAt, grant,
        function(err, result) {
          if (err) {
            return done(err);
          }

          accessToken._save(apiId, clientId, userId, scopes,
                  aTknOption.id, rTknOption.id, aTknOption.secret,
                  aTknOption.issuedAt, aTknOption.expiredAt,
                  grant, aTknOption.azCode, done);
        });
    } else {
      accessToken._save(apiId, clientId, userId, scopes,
              aTknOption.id, undefined, aTknOption.secret,
              aTknOption.issuedAt, aTknOption.expiredAt,
              grant, aTknOption.azCode, done);
    }
  };

  var refreshToken = {};
  refreshToken.find = function(apiId, id, done) {
    logger.debug('refreshToken.find(<id>)');
    oAuthRefreshTokenModel.findOne(
      { where: { id: id } },
      function(err, result) {
        if (!result || _.isUndefined(result.id) || result.apiId !== apiId) {
          return done(err);
        }
        return done(err, result);
      });
  };

  refreshToken.delete = function(clientId, id, done) {
    logger.debug('refreshToken.delete(', clientId, ',<id>)');
    var where = { id: id, appId: clientId };
    oAuthRefreshTokenModel.destroyAll(where, done);
  };

  refreshToken.purge = function() {
    var where = {
      expiredAt: { lte: new Date() } };

    oAuthRefreshTokenModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the refresh tokens.', error);
        return;
      }
      logger.debug('%d expired refresh tokens are purged', result.count);
    });
  };

  refreshToken._save = function(apiId, clientId, userId, scopes,
          id, secret, countDown, iat, exp, grant, done) {
    var tokenObj = {
      id: id,
      apiId: apiId,
      appId: clientId,
      userId: userId,
      secret: secret,
      grant: grant,
      scopes: scopes,
      countDown: countDown,
      tokenType: 'Bearer',
      issuedAt: iat,
      expiredAt: exp,
      expiresIn: (exp - iat) / 1000 };

    logger.debug('A refresh token is created: %j', tokenObj);
    oAuthRefreshTokenModel.create(tokenObj, done);
  };

  var code = {};
  code.findByCode = code.find = function(apiId, code, done) {
    oAuthAuthorizationCodeModel.findOne(
      { where: { id: code } },
      function(err, result) {
        if (!result || _.isUndefined(result.id) || result.apiId !== apiId) {
          return done(err);
        };
        done(err, result);
      });
  };

  code.delete = function(apiId, code, done) {
    var where = { id: code };
    if (_.isString(apiId)) {
      where.apiId = apiId;
    }
    oAuthAuthorizationCodeModel.destroyAll(where, done);
  };

  code.purge = function(done) {
    var where = {
      expiredAt: { lte: new Date() } };

    oAuthAuthorizationCodeModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the authorization codes.', error);
        return;
      }
      logger.debug('%d expired authorization codes are purged', result.count);
    });
  };

  //Use the AZ code as id (instead of jwt id), so no need to save the secret.
  code.save = function(apiId, clientId, userId,
          code, scopes, redirectURI, iat, exp, done) {
    var codeObj = {
      id: code,
      apiId: apiId,
      appId: clientId,
      userId: userId,
      issuedAt: new Date(iat),
      expiredAt: new Date(exp),
      expiresIn: (exp - iat) / 1000,
      scopes: scopes,
      used: false,
      redirectURI: redirectURI };

    logger.debug('An authorization code is created: %j', codeObj);
    oAuthAuthorizationCodeModel.create(codeObj, done);
  };

  var permission = {};
  permission.find = function(apiId, appId, userId, done) {
    oAuthPermissionModel.findOne(
      { where: { apiId: apiId, appId: appId, userId: userId } },
      done);
  };

  /*
   * Check if a client app is authorized by the user
   */
  permission.isAuthorized = function(apiId, appId, userId, scopes, done) {
    permission.find(apiId, appId, userId, function(err, perm) {
      if (err) {
        return done(err);
      }
      if (!perm) {
        return done(null, false);
      }
      var ok = helpers.isScopeAuthorized(scopes, perm.scopes);
      var info = ok ? { authorized: true } : {};
      return done(null, ok, info);
    });
  };

  permission.purge = function(done) {
    var where = {
      expiredAt: { lte: new Date() } };

    oAuthPermissionModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the permissions.', error);
        return;
      }
      logger.debug('%d expired permissions are purged', result.count);
    });
  };

  /*
   * Grant permissions to a client app by a user
   */
  permission.addPermission = function(apiId, appId, userId, scopes, done) {
    oAuthPermissionModel.findOrCreate(
      { where: { apiId: apiId, appId: appId, userId: userId } },
      { apiId: apiId, appId: appId, userId: userId, scopes: scopes, issuedAt: new Date() },
      function(err, perm, created) {
        if (created) {
          return done(err, perm, created);
        } else if (helpers.isScopeAuthorized(scopes, perm.scopes)) {
          return done(err, perm);
        } else {
          perm.updateAttributes({ scopes: helpers.normalizeList(scopes) }, done);
        }
      });
  };

  // Adapter for the oAuth2 provider
  var customModels = options.models || {};
  oauthModels.models = {
    clients: customModels.clients || clients,
    accessTokens: customModels.accessTokens || accessToken,
    refreshTokens: customModels.refreshTokens || refreshToken,
    authorizationCodes: customModels.authorizationCodes || code,
    permissions: customModels.permission || permission };
}

var sInstances = {}; ///< store datasourceDef <==> OAuthModels

/**
 * Get/create OAuthModels based on the datasourceDef
 * @param datasourceDef object contains 'name' and 'connector' properties
 * @returns OAuthModels
 */
function getInstance(dsDef) {
  dsDef = dsDef ||
      { name: 'microgw-oauth-db', connector: 'memory' };
  var ddid = JSON.stringify(dsDef);

  var instance = findByDatasource(ddid);
  if (_.isNull(instance)) {
    instance = new OAuthModels({ dataSource: dsDef });
    sInstances[ddid] = instance;
  }
  return instance;
}

module.exports.getInstance = getInstance;
