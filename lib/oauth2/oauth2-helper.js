// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var jwt = require('jws');
var uid = require('uid-safe');
var _ = require('lodash');

var AuthorizationError = require('./errors/authorizationerror');

function clientInfo(client) {
  if (!client) {
    return client;
  }
  return client.title;
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
  next = next || function(err) {
    return err;
  };
  var err;
  if (options.redirectURI) {
    var redirectURIs = [client['oauth-redirection-uri']];

    if (redirectURIs.length > 0) {
      var matched = false;
      for (var i = 0, n = redirectURIs.length; i < n; i++) {
        if (options.redirectURI.indexOf(redirectURIs[i]) === 0) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        err = new AuthorizationError(
            'Unauthorized redirectURI: ' + options.redirectURI, 'access_denied');
        return next(err) || err;
      }
    }
  }

  if (options.scope) {
    var requestedScopes = normalizeList(options.scope);
    if (!server.supportScope(requestedScopes)) {
      err = new AuthorizationError(
          'Unauthorized scope: ' + options.scope, 'access_denied');
      return next(err) || err;
    }
  }

  // token or code
  if (options.responseType) {
    if (!server.supportResponseType(options.responseType)) {
      err = new AuthorizationError(
          'Unauthorized response type: ' + options.responseType, 'access_denied');
      return next(err) || err;
    }
  }

  if (options.grantType) {
    if (!server.supportGrantType(options.grantType)) {
      err = new AuthorizationError(
          'Unauthorized grant type: ' + options.grantType, 'access_denied');
      return next(err) || err;
    }
  }
  return null;
}

function generateJWT(payload, secret, alg) {
  var body = {
    header: { alg: alg || 'HS256' }, // Default to hash
    secret: secret,
    payload: payload
  };
  return jwt.sign(body);
}

function buildTokenParams(accessToken, token) {
  var params = {
    expires_in: accessToken.expiresIn
  };
  var scope = accessToken.scopes && accessToken.scopes.join(' ');
  if (scope) {
    params.scope = scope;
  }
  if (accessToken.refreshToken) {
    params.refresh_token = accessToken.refreshToken;
  }
  if (typeof token === 'object') {
    for (var p in token) {
      if (p !== 'id' && !params[p] && token[p]) {
        params[p] = token[p];
      }
    }
  }
  return params;
}

function redirect(ctx, location) {
  ctx.message.headers.Location = location;
  ctx.message.status = {code: 302, reason: 'Found'};
}

/**
 * create a transaction data and contains txId and client
 * @param client
 */
function createTXData(client) {
  var rev = {};
  rev.protocol = 'oauth2';
  rev.client = client;
  rev.transactionID = uid.sync(8);
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

module.exports = {
  clientInfo: clientInfo,
  userInfo: userInfo,
  isExpired: isExpired,
  normalizeList: normalizeList,
  validateClient: validateClient,
  isScopeAllowed: isScopeAllowed,
  isScopeAuthorized: isScopeAuthorized,
  generateJWT: generateJWT,
  buildTokenParams: buildTokenParams,
  redirect: redirect,
  createTXData: createTXData,
  searchTXData: searchTXData
};
