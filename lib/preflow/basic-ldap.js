'use strict';

let ldap = require('ldapjs');
let auth = require('basic-auth');
let configureTls = require('./configure-tls');
let debug = require('debug')('micro-gateway:preflow:basic-auth:ldap');

/**
 * These are the options that may be defined in the return value of this function
 *    url {String}
 *        E.g. 'ldaps://ldap.example.com:663'
 *    bindDn {String}
 *        Optional, e.g. 'uid=myapp,ou=users,o=example.com'. Alias: adminDn
 *    bindCredentials {String}
 *        Password for bindDn. Aliases: Credentials, adminPassword
 *    bindProperty {String}
 *        Optional, default 'dn'. Property of user to bind against client
 *        e.g. 'name', 'email'
 *    searchBase {String}
 *        The base DN from which to search for users by username.
 *         E.g. 'ou=users,o=example.com'
 *    searchScope {String}
 *        Optional, default 'sub'. Scope of the search, one of 'base',
 *        'one', or 'sub'.
 *    searchFilter {String}
 *        LDAP search filter with which to find a user by username, e.g.
 *        '(uid={{username}})'. Use the literal '{{username}}' to have the
 *        given username be interpolated in for the LDAP search.
 *    searchAttributes {Array}
 *        Optional, default all. Array of attributes to fetch from LDAP server.
 *
 *    TODO Deal with groups later
 *    groupDnProperty {String}
 *        Optional, default 'dn'. The property of user object to use in
 *        '{{dn}}' interpolation of groupSearchFilter.
 *    groupSearchBase {String}
 *        Optional. The base DN from which to search for groups. If defined,
 *        also groupSearchFilter must be defined for the search to work.
 *    groupSearchScope {String}
 *        Optional, default 'sub'.
 *    groupSearchFilter {String}
 *        Optional. LDAP search filter for groups. The following literals are
 *        interpolated from the found user object: '{{dn}}' the property
 *        configured with groupDnProperty.
 *    groupSearchAttributes {Array}
 *        Optional, default all. Array of attributes to fetch from LDAP server.
 *
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
function parseOptions (opts) {
  let ldapconf = opts.registry['ldap-config'];

  const options = {
    url: null,
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
      attributes: []
    },
    groupAuth: {
      searchBase: null,
      filter: null,
      scope: null,
      sizeLimit: 1,
      attributes: []
    }
  };

  let authmethod = ldapconf['auth-method'];
  let authfn;

  if (ldapconf.ssl) {
    options.url = `ldaps://${ldapconf['host']}:${ldapconf['port']}`;
    options.tlsOptions = configureTls(opts.tlsprofile);
  }

  else
    options.url = `ldap://${ldapconf['host']}:${ldapconf['port']}`;

  options.authenticatedBind = ldapconf['authenticated-bind'];
  if (options.authenticatedBind) {
    options.bindDn          = ldapconf['authenticated-bind-admin-dn'];
    options.bindCredentials = ldapconf['authenticated-bind-password'];
  }

  // SearchDN - Compose search fitler
  if (authmethod === null || authmethod === 'searchDN') {
    let userauth = options.userAuth;
    let sfprefix = ldapconf['search-dn-filter-prefix'];
    let sfsuffix = ldapconf['search-dn-filter-suffix'];
    userauth.searchBase = ldapconf['search-dn-base'];
    userauth.filter     = `${sfprefix}{{username}}${sfsuffix}`;
    userauth.scope      = ldapconf['search-dn-scope'] || 'sub';
    userauth.sizeLimit  = 1;
    userauth.attributes = ['dn', 'sn', 'cn', 'mail', 'givenName'];
  }

  // ComposeDN - Attempt to bind with composed DN (may also be referred to as BindDN?)
  else if (authmethod === 'composeDN' || authmethod === 'bindDN') {
    let userauth    = options.userAuth;
    let bindprefix  = ldapconf['bind-prefix'];
    let bindsuffix  = ldapconf['bind-suffix'];
    options.bindDn  = `${bindprefix}{{username}}${bindsuffix}`;
  }

  // ComposeUPN - Attempt to bind with composed UPN (as DN?)
  else if (authmethod === 'composeUPN' || authmethod === 'bindUPN') {
    let bindsuffix = ldapconf['bind-suffix'];
    options.bindDn = `{{username}}${bindsuffix}`;
    let userauth   = options.userAuth;
    userauth.searchBase = '';
    userauth.filter     = '(objectClass=*)';
    userauth.scope      = 'base';
    userauth.attributes = ['defaultNamingContext'];
  }

  else {
    // Others not currently supported
    throw new Error(`Unsupported LDAP authentication method: ${ldapconf['auth-method']}`);
  }

  return options;
}

function generateDN (user, dn) {
  // As found in ldapauth-fork
  // https://tools.ietf.org/search/rfc4515#section-3
  const username = user.replace(/\*/g, '\\2a')
  .replace(/\(/g, '\\28')
  .replace(/\)/g, '\\29')
  .replace(/\\/g, '\\5c')
  .replace(/\0/g, '\\00')
  .replace(/\//g, '\\2f');
  return dn.replace(/{{username}}/g, username);
}

function bind (client, dn, pass) {
  return new Promise((resolve, reject) => {
    client.bind(dn, pass, (err, res) => {
      if (err) {
        debug('Error during LDAP bind:', err);
        reject(err);
      }
      else {
        resolve(res);
      }
    });
  })
}

function search (client, options) {
  return new Promise((resolve, reject) => {
    let baseDn = options.searchBase;
    let users = [];
    client.search(baseDn, options, (err, res) => {
      if (err) {
        debug('Error during LDAP search:', err);
        return reject(err);
      }
      res.on('searchEntry', entry => {
          users.push(entry.object);
          debug('LDAP Entry found:', entry.object);
      });
      res.on('searchReference', referral => {
          debug(`LDAP search Referral: ${referral.uris.join(',')}`);
      });
      res.on('error', err => {
          debug(`LDAP Search Error: ${err.message}`);
          reject(err);
      });
      res.on('end', results => {
        let numresults = users.length;
        debug(`LDAP search return ${numresults} results`);
        resolve(users);
      });
    })
  });
}

function authSearchDN (client, options, user, pass) {
  let userauth = options.userAuth;
  userauth.filter = generateDN(user, userauth.filter);

  let p = options.authenticatedBind
          ? bind(client, options.bindDn, options.bindCredentials)
          : Promise.resolve();

  return p.then(() => search(client, userauth))
    .then(users => {
      let len = users.length;
      if (len === 1)
        return bind(client, users[0].dn, pass);
      else if (len === 0) {
        let msg = `No user matching ${userauth.filter} found`;
        debug(msg);
        throw new Error(msg);
      }
      else {
        let msg = `Too many results found: ${users.map(u => u.dn).join(';')}`;
        debug(msg);
        throw new Error(msg);
      }
    });
}

function authComposeDN (client, options, user, pass) {
  return bind(client, generateDN(user, options.bindDn), pass)
}

function authComposeUPN (client, options, user, pass) {
  return bind(client, generateDN(user, options.bindDn), pass);
}

const authFunctions = {
  searchDN:   authSearchDN,
  composeDN:  authComposeDN,
  bindDN:     authComposeDN,
  composeUPN: authComposeUPN,
  bindUPN:    authComposeUPN
};

// Export a function that returns an API object
module.exports = function (opts) {

  const registry = opts && opts.registry;
  const ldapconf = registry && registry['ldap-config'];

  if (!registry || !ldapconf)
    throw new Error('Invalid LDAP Registry!');

  const authfn = authFunctions[ldapconf['auth-method']];

  if (!authfn)
    throw new Error(`Invalid authentication method: ${ldapconf['auth-method']}`);

  const options = parseOptions(opts);

  // Given a username and password, authenticate against LDAP
  function authenticate (user, pass) {
    let client = ldap.createClient(options);

    client.on('error', err => {
      debug('Error when connecting to LDAP server:', err);
      reject(err);
    });

    return authfn(client, options, user, pass)
      .then(res => {
        debug('Authentication successful!');
        client.unbind(err => {
          if (err)
            debug('Error during LDAP unbind:', err);
          client = null;
        });
        return res;
      })
      .catch(err => {
        debug('Authentication failed!', err);
        client.unbind(err => {
          if (err)
            debug('Error during LDAP unbind:', err);
          client = null;
        });
        throw err;
      });
  }

  // Provide ability to parse requests for Basic Auth
  function parse (req) {
    return new Promise(function (resolve, reject) {
      let user = auth(req);
      if (!user) {
        reject({
          error: new Error('No basic auth provided!')
        });
        return;
      }
      resolve({ username: user.name, password: user.pass });
    });
  }

  return { parse: parse, authenticate: authenticate };
};

