// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var ldap = require('ldapjs');
var auth = require('basic-auth');
var configureTls = require('./configure-tls');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:security-check:basic-ldap' });
var Promise = require('bluebird');

/**
 *    From the registry:
 *      "search-dn-base": "dc=apim,dc=com",
 *      "search-dn-filter-prefix": "",
 *      "search-dn-filter-suffix": "",
 *      "auth-method": "searchDN",
 *      "bind-prefix": "(uid=",
 *      "bind-suffix": ")",
 *      "search-dn-scope": "sub",
 *      "group-auth-method": "none",
 *      "static-group-dn": "",
 *      "static-group-filter-prefix": "",
 *      "static-group-filter-suffix": "",
 *      "static-group-scope": "sub",
 *      "dynamic-group-filter": "",
 *      "search-filter": "",
 *      "ldap-options": {
 *           "referral": "follow",
 *           "referral-limit": 10,
 *           "search-limit": 100,
 *           "time-limit": 0,
 *           "field-mapping": {
 *             "email": "email",
 *             "first-name": "givenName",
 *             "last-name": "sn",
 *             "full-name": "cn"
 *           }
 *
 */
function parseOptions(opts) {
  var ldapconf = opts.registry['ldap-config'];

  var defaultTimeout = 300000;

  var options = {
    url: null,
    timeout: defaultTimeout,
    authenticatedBind: false,
    bindDn: null,
    bindCredentials: null,
    tlsOptions: null,
    userAuth: {
      bindDn: null,
      searchBase: null,
      filter: null,
      scope: null,
      sizeLimit: 1,
      attributes: [ 'dn' ] } };

  var authmethod = ldapconf['auth-method'];

  if (ldapconf.ssl) {
    options.url = 'ldaps://' + ldapconf['host'] + ':' + ldapconf['port'];
    options.tlsOptions = configureTls(opts.tlsprofile);
  } else {
    options.url = 'ldap://' + ldapconf['host'] + ':' + ldapconf['port'];
  }

  options.timeout = (ldapconf['ldap-options'] && ldapconf['ldap-options']['time-limit']) || defaultTimeout;

  options.authenticatedBind = ldapconf['authenticated-bind'];
  if (options.authenticatedBind) {
    options.bindDn = ldapconf['authenticated-bind-admin-dn'];
    options.bindCredentials = ldapconf['authenticated-bind-admin-password'];
  }

  var userauth;
  var bindsuffix;
  if (authmethod === null || authmethod === 'searchDN') {
    // SearchDN - Compose search fitler
    userauth = options.userAuth;
    var sfprefix = ldapconf['search-dn-filter-prefix'];
    var sfsuffix = ldapconf['search-dn-filter-suffix'];
    userauth.searchBase = ldapconf['search-dn-base'];
    userauth.filter = sfprefix + '{{username}}' + sfsuffix;
    userauth.scope = ldapconf['search-dn-scope'] || 'sub';
    userauth.sizeLimit = 1;
    userauth.attributes = [ 'dn', 'sn', 'cn', 'mail', 'givenName' ];
  } else if (authmethod === 'composeDN' || authmethod === 'bindDN') {
    // ComposeDN - Attempt to bind with composed DN (may also be referred to as BindDN?)
    userauth = options.userAuth;
    var bindprefix = ldapconf['bind-prefix'];
    bindsuffix = ldapconf['bind-suffix'];
    options.bindDn = bindprefix + '{{username}}' + bindsuffix;
  } else if (authmethod === 'composeUPN' || authmethod === 'bindUPN') {
    // ComposeUPN - Attempt to bind with composed UPN (as DN?)
    bindsuffix = ldapconf['bind-suffix'];
    options.bindDn = '{{username}}' + bindsuffix;
    userauth = options.userAuth;
    userauth.searchBase = '';
    userauth.filter = '(objectClass=*)';
    userauth.scope = 'base';
    userauth.attributes = [ 'defaultNamingContext' ];
  } else {
    // Others not currently supported
    throw new Error('Unsupported LDAP authentication method: ' + ldapconf['auth-method']);
  }

  return options;
}

function parseGroupAuthOptions(opts, userAuthResult) {
  var ldapconf = opts.registry['ldap-config'];
  var authmethod = ldapconf['group-auth-method'];
  var uarGroupAuth = userAuthResult.groupAuth;

  if (!authmethod || authmethod === 'none') {
    return null;
  }

  var options = {
    bindDn: null,
    bindCredentials: null,
    filter: null,
    groupAuthMethod: authmethod,
    searchBase: null,
    scope: null,
    sizeLimit: 1,
    attributes: uarGroupAuth.attributes };

  if (authmethod === 'dynamicAuth') {
    options.filter = uarGroupAuth.filterPrefix
      ? '(&' + uarGroupAuth.filterPrefix + ldapconf['dynamic-group-filter'] + ')'
      : ldapconf['search-filter']; // ???
    options.bindDn = userAuthResult.bindDn;
    options.bindCredentials = userAuthResult.bindCredentials;
    options.searchBase = uarGroupAuth.searchBase;
    options.scope = uarGroupAuth.scope;
  } else if (authmethod === 'staticAuth') {
    var filterDn = userAuthResult.bindDn;
    var prefix = ldapconf['static-group-filter-prefix'];
    var suffix = ldapconf['static-group-filter-suffix'];
    options.filter = prefix + filterDn + suffix;
    options.bindDn = ldapconf['authenticated-bind-admin-dn'];
    options.bindCredentials = ldapconf['authenticated-bind-admin-password'];
    options.searchBase = ldapconf['static-group-dn'];
    options.scope = ldapconf['static-group-scope'];
  }

  return options;
}

function generateDN(user, dn) {
  // As found in ldapauth-fork
  // https://tools.ietf.org/search/rfc4515#section-3
  var username = user.replace(/\*/g, '\\2a')
                       .replace(/\(/g, '\\28')
                       .replace(/\)/g, '\\29')
                       .replace(/\\/g, '\\5c')
                       .replace(/\0/g, '\\00')
                       .replace(/\//g, '\\2f');
  return dn.replace(/{{username}}/g, username);
}

function bind(client, dn, pass) {
  return new Promise(function(resolve, reject) {
    client.bind(dn, pass, function(err, res) {
      if (err) {
        logger.debug('Error during LDAP bind:', err);
        reject(err);
      } else {
        resolve(res);
      }
    });
  });
}

function search(client, options) {
  return new Promise(function(resolve, reject) {
    var baseDn = options.searchBase;
    var users = [];
    client.search(baseDn, options, function(err, res) {
      if (err) {
        logger.debug('Error during LDAP search: %j', err.message || err);
        return reject(err);
      }
      res.on('searchEntry', function(entry) {
        users.push(entry.object);
        logger.debug('LDAP Entry found: %j', entry.object);
      });
      res.on('searchReference', function(referral) {
        logger.debug('LDAP search Referral: %s', referral.uris.join(','));
      });
      res.on('error', function(err) {
        logger.debug('LDAP Search Error: %s', err.message);
        reject(err);
      });
      res.on('end', function(results) {
        var numresults = users.length;
        logger.debug('LDAP search return %d results', numresults);
        resolve(users);
      });
    });
  });
}

function authSearchDN(client, options, user, pass) {
  var userauth = options.userAuth;
  userauth.filter = generateDN(user, userauth.filter);

  var p = options.authenticatedBind
          ? bind(client, options.bindDn, options.bindCredentials)
          : Promise.resolve();

  var userDn;
  var msg;
  return p.then(function() { return search(client, userauth); })
    .then(function(users) {
      var len = users.length;
      if (len === 1) {
        userDn = users[0].dn;
        return bind(client, userDn, pass);
      } else if (len === 0) {
        msg = 'No user matching ' + userauth.filter + ' found';
        logger.debug(msg);
        throw new Error(msg);
      } else {
        msg = 'Too many results found: ' + users.map(function(u) { return u.dn; }).join(';');
        logger.debug(msg);
        throw new Error(msg);
      }
    })
    .then(function(res) {
      return {
        bindDn: userDn,
        bindCredentials: pass,
        groupAuth: {
          searchBase: userDn,
          filterPrefix: '',
          scope: '',
          sizeLimit: 1,
          attributes: [ 'dn' ] } };
    });
}

function authComposeDN(client, options, user, pass) {
  var userDn = generateDN(user, options.bindDn);
  return bind(client, userDn, pass)
    .then(function(res) {
      return {
        bindDn: userDn,
        bindCredentials: pass,
        groupAuth: {
          searchBase: userDn,
          filterPrefix: '',
          scope: '',
          sizeLimit: 1,
          attributes: [ 'dn' ] } };
    });
}

function authComposeUPN(client, options, user, pass) {
  var userauth = options.userAuth;
  var bindDn = generateDN(user, options.bindDn);
  return bind(client, bindDn, pass)
    .then(function() { return search(client, userauth); })
    .then(function(users) {
      if (users.length === 0) {
        var msg = 'Search returned no results';
        logger.debug(msg);
        throw new Error(msg);
      }
      var user = users[0];
      return {
        bindDn: bindDn,
        bindCredentials: pass,
        groupAuth: {
          searchBase: user.defaultNamingContext,
          filterPrefix: '(userPrincipleName=' + bindDn + ')',
          scope: 'sub',
          sizeLimit: 1,
          attributes: [ 'dn' ] } };
    });
}

function groupAuth(client, options, userAuthResult) {
  var groupAuthOptions = parseGroupAuthOptions(options, userAuthResult);

  if (!groupAuthOptions) {
    return Promise.resolve();
  }

  return bind(client, groupAuthOptions.bindDn, groupAuthOptions.bindCredentials)
    .then(function() { return search(client, groupAuthOptions); });
}

var authFunctions = {
  searchDN: authSearchDN,
  composeDN: authComposeDN,
  bindDN: authComposeDN,
  composeUPN: authComposeUPN,
  bindUPN: authComposeUPN };

// Export a function that returns an API object
module.exports = function(opts) {
  var registry = opts && opts.registry;
  var ldapconf = registry && registry['ldap-config'];

  if (!registry || !ldapconf) {
    throw new Error('Invalid LDAP Registry!');
  }

  var authfn = authFunctions[ldapconf['auth-method']];

  if (!authfn) {
    throw new Error('Invalid authentication method: %s', ldapconf['auth-method']);
  }

  var options = parseOptions(opts);

  // Given a username and password, authenticate against LDAP
  function authenticate(user, pass) {
    var client = ldap.createClient(options);

    client.on('error', function(err) {
      logger.debug('Error when connecting to LDAP server: %s', err.message || err);
      throw err;
    });

    return authfn(client, options, user, pass)
      .then(function(userAuthResult) {
        logger.debug('Authentication successful!');
        return groupAuth(client, opts, userAuthResult);
      })
      .then(function() {
        logger.debug('Authorization successful!');
        client.unbind(function(err) {
          if (err) {
            logger.debug('Error during LDAP unbind: %j', err.message || err);
          }
          client = null;
        });
        return true;
      })
      .catch(function(err) {
        logger.debug('Authentication failed: %j', err.message || err);
        client.unbind(function(err) {
          if (err) {
            logger.debug('Error during LDAP unbind: %j', err.message || err);
          }
          client = null;
        });
        throw err;
      });
  }

  // Provide ability to parse requests for Basic Auth
  function parse(req) {
    return new Promise(function(resolve, reject) {
      var user = auth(req);
      if (!user) {
        reject({ error: new Error('No basic auth provided!') });
        return;
      }
      resolve({ username: user.name, password: user.pass });
    });
  }

  return { parse: parse, authenticate: authenticate };
};

