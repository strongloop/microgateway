// Copyright IBM Corp. 2014,2015. All Rights Reserved.
// Node module: loopback-component-oauth2
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var pathToRegexp = require('path-to-regexp');
var debug = require('debug')('loopback:oauth2:scope');
var oauth2Provider = require('../az-server/oauth2orize');
var helpers = require('../oauth2-helper');

function toLowerCase(m) {
  return m.toLowerCase();
}

/**
 * Load the definition of scopes
 *
 * ```json
 * {
 *   "scope1": [{"methods": "get", path: "/:user/profile"}, "/order"],
 *   "scope2": [{"methods": "post", path: "/:user/profile"}]
 * }
 * ```
 * @param {Object} scopes
 * @returns {Object}
 */
function loadScopes(scopes) {
  var scopeMapping = {};
  if (typeof scopes === 'object' && !Array.isArray(scopes)) {
    for (var s in scopes) {
      var routes = [];
      var entries = scopes[s];
      debug('Scope: %s routes: %j', s, entries);
      if (Array.isArray(entries)) {
        for (var j = 0, k = entries.length; j < k; j++) {
          var route = entries[j];
          if (typeof route === 'string') {
            routes.push({
              methods: [ 'all' ],
              path: route,
              regexp: pathToRegexp(route, [], { end: false }) });
          } else {
            var methods = helpers.normalizeList(route.methods);
            if (methods.length === 0) {
              methods.push('all');
            }
            methods = methods.map(toLowerCase);
            routes.push({
              methods: methods,
              path: route.path,
              regexp: pathToRegexp(route.path, [], { end: false }) });
          }
        }
      } else {
        debug('Routes must be an array: %j', entries);
      }
      scopeMapping[s] = routes;
    }
  } else if (typeof scopes === 'string' || Array.isArray(scopes)) {
    scopes = helpers.normalizeList(scopes);
    for (var i = 0, n = scopes.length; i < n; i++) {
      scopeMapping[scopes[i]] =
          [ { methods: 'all', path: '/.+', regexp: /\/.+/ } ];
    }
  }
  return scopeMapping;
}

function findMatchedScopes(req, scopeMapping) {
  var matchedScopes = [];
  var method = req.method.toLowerCase();
  var url = req.originalUrl;
  for (var s in scopeMapping) {
    var routes = scopeMapping[s];
    for (var i = 0, n = routes.length; i < n; i++) {
      var route = routes[i];
      if (route.methods.indexOf('all') !== -1 ||
        route.methods.indexOf(method) !== -1) {
        debug('url: %s, regexp: %s', url, route.regexp);
        var index = url.indexOf('?');
        if (index !== -1) {
          url = url.substring(0, index);
        }
        if (route.regexp.test(url)) {
          matchedScopes.push(s);
        }
      }
    }
  }
  return matchedScopes;
}

/**
 * Validate if the oAuth 2 scope is satisfied
 *
 * @param {Object} options Options object
 * @returns {validateScope}
 */
module.exports = function(options) {
  var configuredScopes = options.checkScopes || options.scopes || options.scope;
  var checkScopes;
  if (typeof configuredScopes === 'function') {
    checkScopes = configuredScopes;
  } else {
    checkScopes = function(req, tokenScopes, cb) {
      var scopeMapping = loadScopes(configuredScopes);
      debug('Scope mapping: ', scopeMapping);
      var allowedScopes = findMatchedScopes(req, scopeMapping);
      debug('Allowed scopes: ', allowedScopes);
      if (helpers.isScopeAllowed(allowedScopes, tokenScopes)) {
        cb();
      } else {
        debug('Insufficient scope: ', tokenScopes);
        cb(new oauth2Provider.TokenError(
          'Insufficient scope', 'insufficient_scope', null, 403));
      }
    };
  }
  return function validateScope(req, res, next) {
    var scopes = req.accessToken && req.accessToken.scopes;
    debug('Scopes of the access token: ', scopes);
    checkScopes(req, scopes, next);
  };
};

