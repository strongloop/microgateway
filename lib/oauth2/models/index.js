// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var loopback = require('loopback');
var logger = require('apiconnect-cli-logger/logger.js')
  .child({loc: 'microgateway:oauth2:models'});
var _ = require('lodash');

var dsc = require('../../../datastore/client');
var helpers = require('../oauth2-helper');

/*
 * json files for model definitions
 */
var defs = {
    OAuthAuthorizationCode: require('../common/models/oauth-authorization-code.json'),
    OAuthClientApplication: require('../common/models/oauth-client-application.json'),
    OAuthPermission: require('../common/models/oauth-permission.json'),
    OAuthScopeMapping: require('../common/models/oauth-scope-mapping.json'),
    OAuthScope: require('../common/models/oauth-scope.json'),
    OAuthAccessToken: require('../common/models/oauth-access-token.json'),
    OAuthRefreshToken: require('../common/models/oauth-refresh-token.json')
};

function getTTLFunc(responseType, clientId, userId, scopes, options) {
  options = options || {};
  if (typeof options.ttl === 'function') {
    return options.ttl(responseType, clientId, userId, scopes);
  }
  if (typeof options.ttl === 'number') {
    return options.ttl;
  }
  if (typeof options.ttl === 'object' && options.ttl !== null) {
    return options.ttl[responseType];
  }
  switch (responseType) {
    case 'code':
      return 300; //5 mins (RFC recommends no longer than 10 mins)
    default:
      return 14 * 24 * 3600; //2 weeks
  }
}

/**
 * create a loopback application, OAuth data models, attach data models to
 * connector and also the loopback application
 */
function OAuthModels (config) {
  config = config || {};
  var dataSourceDef = config.dataSource || 
      {name: 'microgw-oauth-db', connector: 'memory'};

  this.dbName = dataSourceDef.name;

  this.app = loopback();
  this.ds = this.app.dataSource(this.dbName, dataSourceDef);
  this.dataModels = {};
  var modelNames = Object.getOwnPropertyNames(defs);
  for (var index=0, len=modelNames.length; index < len; index++) {
    var name = modelNames[index];
    this.dataModels[name] = loopback.createModel(defs[name]);
    this.app.model(this.dataModels[name], {dataSource: this.ds});
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
  var userModel = loopback.findModel(options.userModel) ||
    loopback.getModelByType(loopback.User);
  //TODO: we should remove applicationModel
  var applicationModel = loopback.findModel(options.applicationModel) ||
    dataModels.OAuthClientApplication;

  var oAuthAccessTokenModel = dataModels.OAuthAccessToken;
  var oAuthRefreshTokenModel = dataModels.OAuthRefreshToken;
  var oAuthAuthorizationCodeModel = dataModels.OAuthAuthorizationCode;
  var oAuthPermissionModel = dataModels.OAuthPermission;

  var getTTL = typeof options.getTTL ===
    'function' ? options.getTTL : getTTLFunc;

  var users = {};
  users.find = function(id, done) {
    logger.debug('users.find(', id, ')');
    userModel.findOne({where: {
      id: id
    }}, done);
  };

  users.findByUsername = function(username, done) {
    logger.debug('users.findByUsername(', username, ')');
    userModel.findOne({where: {
      username: username
    }}, done);
  };

  users.findByUsernameOrEmail = function(usernameOrEmail, done) {
    logger.debug('users.findByUsernameOrEmail(', usernameOrEmail, ')');
    userModel.findOne({where: {
      or: [
        {username: usernameOrEmail},
        {email: usernameOrEmail}
      ]
    }}, done);
  };

  users.save = function(id, username, password, done) {
    logger.debug('users.save(', username, ')');
    userModel.create({
      id: id,
      username: username,
      password: password
    }, done);
  };

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
    dsc.getClientById(snapshotId,
        clientId,
        apiId,
        done);
  };

  var accessToken = {};
  accessToken.find = function(id, done) {
    logger.debug('accessToken.find(<id>)');
    oAuthAccessTokenModel.findOne({where: {
      id: id
    }}, done);
  };

  //TODO:
  accessToken.findByRefreshToken = function(token, done) {
    logger.debug('accessToken.findByRefreshToken(<token>)');
    oAuthAccessTokenModel.findOne({where: {
      refreshToken: token
    }}, done);
  };

  accessToken.findByRefreshTokenId = function(id, done) {
    logger.debug('accessToken.findByRefreshTokenId(<id>)');
    oAuthAccessTokenModel.findOne({where: {
      refreshToken: id
    }}, done);
  };

  accessToken.delete = function(clientId, id, tokenType, done) {
    logger.debug('accessToken.delete(', clientId, ',<id>,', tokenType, ')');
    var where = {
      appId: clientId
    };
    if (tokenType === 'access_token') {
      where.id = id;
    } else {
      where.refreshToken = id;
    }
    oAuthAccessTokenModel.destroyAll(where, done);
  };

  accessToken.purge = function() {
    var where = {
      expiredAt: { lte: new Date() }
    };

    oAuthAccessTokenModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the access tokens.', error);
        return;
      }
      logger.debug('%d expired access tokens are purged', result.count);
    });
  };

  accessToken._save = function(apiId, clientId, userId, scopes,
          id, rTknId, secret, expire, grant, azCode, done) {
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
      tokenType: "Bearer"
    };

    var options;
    if (expire) {
      options = { ttl: { token: expire } };
    }
    var ttl = getTTL('token', clientId, userId, scopes, options);

    tokenObj.issuedAt = new Date();
    tokenObj.expiresIn = ttl;
    tokenObj.expiredAt = new Date(tokenObj.issuedAt.getTime() + ttl * 1000);

    logger.debug("An access token is created: %j", tokenObj);
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
      refreshToken._save(apiId, clientId, userId, scopes, rTknOption.id,
        rTknOption.secret, rTknOption.countDown, rTknOption.expires, grant,
        function(err, result) {
          if (err)
            return done(err);

          accessToken._save(apiId, clientId, userId, scopes, aTknOption.id,
                  rTknOption.id, aTknOption.secret, aTknOption.expire,
                  grant, aTknOption.azCode, done);
      });
    }
    else {
      accessToken._save(apiId, clientId, userId, scopes, aTknOption.id,
              rTknOption.id, aTknOption.secret, aTknOption.expire,
              grant, aTknOption.azCode, done);
    }
  };

  var refreshToken = {};
  refreshToken.find = function(id, done) {
    logger.debug('refreshToken.find(<id>)');
    oAuthRefreshTokenModel.findOne({where: {
      id: id
    }}, done);
  };

  refreshToken.delete = function(clientId, id, done) {
    logger.debug('refreshToken.delete(', clientId, ',<id>)');
    var where = {
      id: id,
      appId: clientId
    };
    oAuthRefreshTokenModel.destroyAll(where, done);
  };

  refreshToken.purge = function() {
    var where = {
      expiredAt: { lte: new Date() }
    };

    oAuthRefreshTokenModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the refresh tokens.', error);
        return;
      }
      logger.debug('%d expired refresh tokens are purged', result.count);
    });
  };

  refreshToken._save = function(apiId, clientId, userId, scopes,
          id, secret, countDown, expire, grant, done) {
    var tokenObj = {
      id: id,
      apiId: apiId,
      appId: clientId,
      userId: userId,
      secret: secret,
      grant: grant,
      scopes: scopes,
      countDown: countDown,
      tokenType: "Bearer"
    };

    var options;
    if (expire) {
        options = { ttl: { token: expire } };
    }
    var ttl = getTTL('token', clientId, userId, scopes, options);

    tokenObj.issuedAt = new Date();
    tokenObj.expiresIn = ttl;
    tokenObj.expiredAt = new Date(tokenObj.issuedAt.getTime() + ttl * 1000);

    logger.debug("A refresh token is created: %j", tokenObj);
    oAuthRefreshTokenModel.create(tokenObj, done);
  };

  var code = {};
  code.findByCode = code.find = function(apiId, key, done) {
    oAuthAuthorizationCodeModel.findOne({where: {
      id: key,
      apiId: apiId
    }}, done);
  };

  code.delete = function(apiId, id, done) {
    oAuthAuthorizationCodeModel.destroyAll({id:id, apiId: apiId}, done);
  };

  code.purge = function(done) {
    var where = {
      expiredAt: { lte: new Date() }
    };

    oAuthAuthorizationCodeModel.destroyAll(where, function(error, result) {
      if (error) {
        logger.error('Failed to purge the authorization codes.', error);
        return;
      }
      logger.debug('%d expired authorization codes are purged', result.count);
    });
  };

  code.save = function(apiId, code, clientId, redirectURI, userId, scopes, ttl, done) {
    var codeObj;
    if (arguments.length === 2 && typeof apiId === 'object') {
      // save(code, cb)
      codeObj = apiId;
      done = code;
    }
    if ( typeof ttl === 'function') {
      done = ttl;
      ttl = getTTL('code', clientId, userId, scopes);
    }

    if (!codeObj) {
      codeObj = {
        id: code,
        apiId: apiId,
        appId: clientId,
        userId: userId,
        scopes: scopes,
        redirectURI: redirectURI
      };
    }
    codeObj.expiresIn = ttl;
    codeObj.issuedAt = new Date();
    codeObj.expiredAt = new Date(codeObj.issuedAt.getTime() + ttl * 1000);
    oAuthAuthorizationCodeModel.create(codeObj, done);
  };

  var permission = {};
  permission.find = function(apiId, appId, userId, done) {
    oAuthPermissionModel.findOne({where: {
      apiId: apiId,
      appId: appId,
      userId: userId
    }}, done);
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
      var info = ok ? { authorized: true} : {};
      return done(null, ok, info);
    });
  };

  permission.purge = function(done) {
    var where = {
      expiredAt: { lte: new Date() }
    };

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
    oAuthPermissionModel.findOrCreate({where: {
      apiId: apiId,
      appId: appId,
      userId: userId
    }}, {
      apiId: apiId,
      appId: appId,
      userId: userId,
      scopes: scopes,
      issuedAt: new Date()
    }, function(err, perm, created) {
      if (created) {
        return done(err, perm, created);
      } else {
        if (helpers.isScopeAuthorized(scopes, perm.scopes)) {
          return done(err, perm);
        } else {
          perm.updateAttributes({scopes: helpers.normalizeList(scopes)}, done);
        }
      }
    });
  };

  // Adapter for the oAuth2 provider
  var customModels = options.models || {};
  oauthModels.models = {
    users: customModels.users || users,
    clients: customModels.clients || clients,
    accessTokens: customModels.accessTokens || accessToken,
    refreshTokens: customModels.refreshTokens || refreshToken,
    authorizationCodes: customModels.authorizationCodes || code,
    permissions: customModels.permission || permission
  };
}

OAuthModels.prototype.createAccessToken = function (clientId, token, userId, scopes) {
  this.dataModels.OAuthAccessToken.create({
    clientId: clientId,
    token: token,
    userId: userId,
    scopes: scopes
  });
};

OAuthModels.prototype.getAccessTokenByClientId = function (clientId, done) {
  this.dataModels.OAuthAccessToken.findOne({
    where: {
      clientId: clientId
    }}, done);
};

var sInstances = {}; ///< store datasourceDef <==> OAuthModels

/**
 * Get/create OAuthModels based on the datasourceDef
 * @param datasourceDef object contains 'name' and 'connector' properties
 * @returns OAuthModels
 */
function getInstance(datasourceDef) {
  datasourceDef = datasourceDef || 
      {name: 'microgw-oauth-db', connector: 'memory'};

  var instance = findByDatasource(datasourceDef);
  if (_.isNull(instance)) {
    instance = new OAuthModels(datasourceDef);
    sInstances[datasourceDef] = instance;
  }
  return instance;
}

module.exports.getInstance = getInstance;
