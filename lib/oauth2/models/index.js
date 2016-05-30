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
    OAuthToken: require('../common/models/oauth-token.json')
};

function getTTLFunc(responseType, clientId, resourceOwner, scopes, options) {
  options = options || {};
  if (typeof options.ttl === 'function') {
    return options.ttl(responseType, clientId, resourceOwner, scopes);
  }
  if (typeof options.ttl === 'number') {
    return options.ttl;
  }
  if (typeof options.ttl === 'object' && options.ttl !== null) {
    return options.ttl[responseType];
  }
  switch (responseType) {
    case 'code':
      return 300;
    default:
      return 14 * 24 * 3600; // 2 weeks
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
  
  var oAuthTokenModel = dataModels.OAuthToken;
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

  var token = {};
  token.find = function(accessToken, done) {
    logger.debug('token.find(<accessToken>)');
    oAuthTokenModel.findOne({where: {
      id: accessToken
    }}, done);
  };

  token.findByRefreshToken = function(refreshToken, done) {
    logger.debug('token.findByRefreshToken(<refreshToken>)');
    oAuthTokenModel.findOne({where: {
      refreshToken: refreshToken
    }}, done);
  };

  token.delete = function(clientId, token, tokenType, done) {
    logger.debug('token.delete(', clientId, ',<token>,', tokenType, ')');
    var where = {
      appId: clientId
    };
    if (tokenType === 'access_token') {
      where.id = token;
    } else {
      where.refreshToken = token;
    }
    oAuthTokenModel.destroyAll(where, done);
  };

  token.save = function(token, clientId, resourceOwner, scopes, refreshToken, done) {
    var tokenObj;
    if (arguments.length === 2 && typeof token === 'object') {
      // save(token, cb)
      tokenObj = token;
      done = clientId;
    }
    var ttl = getTTL('token', clientId, resourceOwner, scopes);
    if (!tokenObj) {
      tokenObj = {
        id: token,
        appId: clientId,
        userId: resourceOwner,
        scopes: scopes,
        issuedAt: new Date(),
        expiresIn: ttl,
        refreshToken: refreshToken
      };
    }
    tokenObj.expiresIn = ttl;
    tokenObj.issuedAt = new Date();
    tokenObj.expiredAt = new Date(tokenObj.issuedAt.getTime() + ttl * 1000);
    oAuthTokenModel.create(tokenObj, done);
  };

  var code = {};
  code.findByCode = code.find = function(key, done) {
    oAuthAuthorizationCodeModel.findOne({where: {
      id: key
    }}, done);
  };

  code.delete = function(id, done) {
    oAuthAuthorizationCodeModel.destroyById(id, done);
  };

  code.save = function(code, clientId, redirectURI, resourceOwner, scopes, done) {
    var codeObj;
    if (arguments.length === 2 && typeof token === 'object') {
      // save(code, cb)
      codeObj = code;
      done = clientId;
    }
    var ttl = getTTL('code', clientId, resourceOwner, scopes);
    if (!codeObj) {
      codeObj = {
        id: code,
        appId: clientId,
        userId: resourceOwner,
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
  permission.find = function(appId, userId, done) {
    oAuthPermissionModel.findOne({where: {
      appId: appId,
      userId: userId
    }}, done);
  };

  /*
   * Check if a client app is authorized by the user
   */
  permission.isAuthorized = function(appId, userId, scopes, done) {
    permission.find(appId, userId, function(err, perm) {
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

  /*
   * Grant permissions to a client app by a user
   */
  permission.addPermission = function(appId, userId, scopes, done) {
    oAuthPermissionModel.findOrCreate({where: {
      appId: appId,
      userId: userId
    }}, {
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
    accessTokens: customModels.accessTokens || token,
    authorizationCodes: customModels.authorizationCodes || code,
    permissions: customModels.permission || permission
  };
}

OAuthModels.prototype.createToken = function (clientId, token, userId, scopes) {
  this.dataModels.OAuthAccessToken.create({
    clientId: clientId,
    token: token,
    userId: userId,
    scopes: scopes
  });
};

OAuthModels.prototype.getTokenByClientId = function (clientId, done) {
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