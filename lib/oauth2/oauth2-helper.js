// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var jwt = require('jws');
var uid = require('uid-safe').sync;
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth:az-helper' });
var url = require('url');
var qs = require('querystring');
var session = require('express-session');

var AuthorizationError = require('./errors/authorizationerror');
var env = require('../../utils/environment');

//TODO: remove this
function clientInfo(client) {
  if (!client) {
    return undefined;
  }

  return client['client-id'];
}

function userInfo(user) {
  if (!user) {
    return user;
  }
  return user.id;
}

function isExpired(tokenOrCode) {
  var issuedTime =
    (tokenOrCode.issuedAt && tokenOrCode.issuedAt.getTime()) || -1;
  var now = Date.now();
  var expirationTime =
    (tokenOrCode.expiredAt && tokenOrCode.expiredAt.getTime()) || -1;
  if (expirationTime === -1 && issuedTime !== -1 &&
    typeof tokenOrCode.expiresIn === 'number') {
    expirationTime = issuedTime + tokenOrCode.expiresIn * 1000;
  }
  return now > expirationTime;
}

/**
 * Normalize items to string[]
 * @param {String|String[]} items
 * @returns {String[]}
 */
function normalizeList(items) {
  if (!items) {
    return [];
  }
  var list;
  if (Array.isArray(items)) {
    list = [].concat(items);
  } else if (typeof items === 'string') {
    list = items.split(/[\s,]+/g).filter(Boolean);
  } else {
    throw new Error('Invalid items: ' + items);
  }
  return list;
}

/**
 * Normalize scope to string[]
 * @param {String|String[]} scope
 * @returns {String[]}
 */
function normalizeScope(scope) {
  return normalizeList(scope);
}

/**
 * Check if one of the scopes is in the allowedScopes array
 * @param {String[]} allowedScopes An array of required scopes
 * @param {String[]} scopes An array of granted scopes
 * @returns {boolean}
 */
function isScopeAllowed(allowedScopes, tokenScopes) {
  allowedScopes = normalizeScope(allowedScopes);
  tokenScopes = normalizeScope(tokenScopes);
  if (allowedScopes.length === 0) {
    return true;
  }
  for (var i = 0, n = allowedScopes.length; i < n; i++) {
    if (tokenScopes.indexOf(allowedScopes[i]) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the requested scopes are covered by authorized scopes
 * @param {String|String[]) requestedScopes
 * @param {String|String[]) authorizedScopes
 * @returns {boolean}
 */
function isScopeAuthorized(requestedScopes, authorizedScopes) {
  requestedScopes = normalizeScope(requestedScopes);
  authorizedScopes = normalizeScope(authorizedScopes);
  if (requestedScopes.length === 0) {
    return true;
  }
  for (var i = 0, n = requestedScopes.length; i < n; i++) {
    if (authorizedScopes.indexOf(requestedScopes[i]) === -1) {
      return false;
    }
  }
  return true;
}

function validateClient(client, server, options, next) {
  options = options || {};

  var err;
  if (options.redirectURI) {
    var redirectURIs = [ client['oauth-redirection-uri'] ];
    var matched = false;
    for (var i = 0, n = redirectURIs.length; i < n; i++) {
      if (options.redirectURI.indexOf(redirectURIs[i]) === 0) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      err = new AuthorizationError(
          'invalid redirect_uri "' + options.redirectURI + '"',
          'invalid_request');
      return next(err) || err;
    }
  }

  if (options.scope) {
    var requestedScopes = normalizeList(options.scope);
    if (!server.supportScope(requestedScopes)) {
      err = new AuthorizationError(
          'Unrecognized scope "' + options.scope + '"',
          'invalid_scope');
      return next(err) || err;
    }
  } else if (options.scope === '') { //scope is required
    err = new AuthorizationError(
        'Missing required parameter: scope',
        'invalid_request');
    return next(err) || err;
  }


  // token or code
  if (options.responseType) {
    if (!server.supportResponseType(options.responseType)) {
      err = new AuthorizationError(
          'Unsupported response type "' + options.responseType + '"',
          'invalid_request');
      return next(err) || err;
    }
  }

  if (options.grantType) {
    if (!server.supportGrantType(options.grantType)) {
      err = new AuthorizationError(
          'Unsupported grant type "' + options.grantType + '"',
          'unsupported_grant_type');
      return next(err) || err;
    }
  }

  return null;
}

function generateJWT(payload, secret, alg) {
  var body = {
    header: { alg: alg || 'HS256' }, // Default to hash
    secret: secret,
    payload: payload };
  return jwt.sign(body);
}

/**
 * Given a JWT token, delete the refresh token.
 */
function deleteRefreshToken(models, token, done) {
  var tmp = token.split('.')[1];

  if (tmp) {
    var jwtTkn = JSON.parse(new Buffer(tmp, 'base64').toString('utf-8'));
    if (jwtTkn.jti) {
      return models
        .refreshTokens
        .delete(undefined, jwtTkn.jti, function(err, record) {
          if (err || !record) {
            return done(err, record);
          }
          return done(null, record);
        });
    }
  }

  return done(); //no match
}

/**
 * Delete the AZ code.
 */
function deleteAZCode(models, code, done) {
  models.authorizationCodes.delete(undefined, code, function(err, record) {
    if (err || !record) {
      return done(err, record);
    }
    return done(null, record);
  });
}

/**
 * Decode the given token, then look it up in the token table, and verify its
 * genuineness. If the token is intact, the saved record will be returned in the
 * done callback.
 */
function validateToken(models, apiId, token, type, done) {
  var tmp = token.split('.')[1];

  if (tmp) {
    var jwtTkn = JSON.parse(new Buffer(tmp, 'base64').toString('utf-8'));
    if (jwtTkn.jti) {
      var table;
      if (type === 'access-token') {
        table = models.accessTokens;
      } else if (type === 'refresh-token') {
        table = models.refreshTokens;
      } else {
        return done(); //no match
      }

      if (table) {
        return table.find(apiId, jwtTkn.jti, function(err, record) {
          if (err || !record) {
            return done(err, record);
          }

          var isIntact = jwt.verify(token, 'HS256', record.secret);

          if (isIntact && jwtTkn.aud === record.appId &&
                  jwtTkn.exp === record.expiredAt.getTime() &&
                  jwtTkn.iat === record.issuedAt.getTime()) {
            logger.debug('The token is verified as authentic. %j', jwtTkn);
            logger.debug('Found the matching record in the data store', record);
            return done(null, record);
          } else {
            logger.error('The token is not authentic. %j vs %j', jwtTkn, record);
            return done(); //no match
          }
        });
      }
    }
  }

  return done(); //no match
}

/**
 * reset all headers and then set redirect header: Location,
 * status code and reason. it also clear the message.body
 *
 * @param ctx
 * @param location
 */
function redirect(ctx, location) {
  //reset all headers here
  ctx.message.headers = { Location: location };
  ctx.message.status = { code: 302, reason: 'Found' };
  //clear message.body
  ctx.message.body = undefined;
}

function redirectError(ctx, oauth2, err) {
  var redirectURI = oauth2.redirectURI;
  var state;
  var type;

  if (oauth2.req && oauth2.req.state) {
    state = oauth2.req.state;
  }

  if (oauth2.req && oauth2.req.type) {
    type = oauth2.req.type;
  }

  if (ctx.request.querystring) {
    var params = qs.parse(ctx.request.querystring);
    if (params.state) {
      state = params.state;
    }
    if (params.response_type) {
      type = params.response_type;
    }
  }
  if (!redirectURI || redirectURI === '') {
    //no redirect uri, write error code to response body
    ctx.message.headers = {};
    if (err.status) {
      ctx.message.status = { code: err.status };
    } else {
      ctx.message.status = { code: 400, reason: 'Bad Request' };
    }
    var rev = { error: err.code };
    if (err.message) {
      rev.err_description = err.message;
    }
    ctx.message.body = JSON.stringify(rev, null, 2);
  } else {
    var uri = url.parse(redirectURI, true);

    if (type.indexOf('token') !== -1) {
      var hash = {};
      hash.error = err.code || 'server_error';
      if (err.message) {
        hash.error_description = err.message;
      }
      if (err.uri) {
        hash.error_uri = err.uri;
      }
      if (state) {
        hash.state = state;
      }
      uri.hash = qs.stringify(hash);
    } else {
      delete uri.search;
      uri.query.error = err.code || 'server_error';
      if (err.message) {
        uri.query.error_description = err.message;
      }
      if (err.uri) {
        uri.query.error_uri = err.uri;
      }
      if (state) {
        uri.query.state = state;
      }
    }

    //reset all headers here
    ctx.message.headers = { Location: url.format(uri) };
    ctx.message.status = { code: 302, reason: 'Found' };
    //clear message.body
    ctx.message.body = undefined;
  }
}

/**
 * create a transaction data and contains txId and client
 * @param client
 */
function createTXData(txns, areq, client) {
  var rev = {};
  rev.protocol = 'oauth2';
  rev.client = client;
  rev.transactionID = uid(8);
  txns[rev.transactionID] = rev;
  rev.req = areq;
  return rev;
}

function searchTXData(txns, areq) {
  for (var txid in txns) {
    var one = txns[txid];
    if (_.isEqual(one.req, areq)) {
      return one;
    }
  }
}

function generateJWTToken(clientId, scope, ttl) {
  var id = uid(32);
  var secret = uid(32);
  var iat = Date.now();

  var payload = {
    jti: id,
    aud: clientId,
    scope: scope,
    iat: iat };

  if (ttl) {
    payload.exp = iat + ttl * 1000;
  }

  var token = generateJWT(payload, secret, 'HS256');
  return { id: id,
    token: token,
    secret: secret,
    issuedAt: payload.iat,
    expiredAt: payload.exp,
    expiresIn: ttl };
}

function getSessionHandler(options) {
  try {
    if (process.env[env.OAUTH2_SESSION_REDIS]) {
      var RedisStore = require('connect-redis')(session);
      var storeOpt = {
        url: process.env[env.OAUTH2_SESSION_REDIS],
        ttl: 600 };
      options.store = new RedisStore(storeOpt);
    }
  } catch (e) {
    logger.error('unable to use redis as session store.' +
        'use in-memory session store instead' +
        e);
  }

  //temporally disalbe the console.warn()
  var warn = console.warn;
  console.warn = function() { /*do nothing*/ };
  var rev = session(options);
  console.warn = warn;//restore
  return rev;
}

function getDSDef(options) {
  if (process.env[env.OAUTH2_TOKEN_REDIS]) {
    options = {
      name: 'microgw-oauth-db',
      connector: 'redis',
      url: process.env[env.OAUTH2_TOKEN_REDIS] };
  } else {
    options = options || { name: 'microgw-oauth-db', connector: 'memory' };
  }
  return options;
}

module.exports = {
  clientInfo: clientInfo,
  userInfo: userInfo,
  isExpired: isExpired,
  normalizeList: normalizeList,
  validateClient: validateClient,
  isScopeAllowed: isScopeAllowed,
  isScopeAuthorized: isScopeAuthorized,
  generateJWT: generateJWT,
  validateToken: validateToken,
  deleteRefreshToken: deleteRefreshToken,
  deleteAZCode: deleteAZCode,
  redirect: redirect,
  redirectError: redirectError,
  createTXData: createTXData,
  searchTXData: searchTXData,
  generateJWTToken: generateJWTToken,
  getSessionHandler: getSessionHandler,
  getDSDef: getDSDef };
