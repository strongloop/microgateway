'use strict';

let ldap = require('ldapjs');
let auth = require('basic-auth');
let configureTls = require('./configure-tls');
let logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:preflow:basic-ldap'});

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
      attributes: ['dn']
    }
  };

  let authmethod = ldapconf['auth-method'];

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

function parseGroupAuthOptions (opts, userAuthResult) {
  let ldapconf = opts.registry['ldap-config'];
  let authmethod = ldapconf['group-auth-method'];
  let uarGroupAuth = userAuthResult.groupAuth;

  if (!authmethod || authmethod === 'none')
    return null;

  const options = {
    bindDn:          null,
    bindCredentials: null,
    filter:          null,
    groupAuthMethod: authmethod,
    searchBase:      null,
    scope:           null,
    sizeLimit:       1,
    attributes:      uarGroupAuth.attributes
  };

  if (authmethod === 'dynamicAuth') {
    options.filter = !!uarGroupAuth.filterPrefix
      ? `(&${uarGroupAuth.filterPrefix}${ldapconf['dynamic-group-filter']})`
      : ldapconf['search-filter']; // ???
    options.bindDn          = userAuthResult.bindDn;
    options.bindCredentials = userAuthResult.bindCredentials;
    options.searchBase      = uarGroupAuth.searchBase;
    options.scope           = uarGroupAuth.scope;
  }

  else if (authmethod === 'staticAuth') {
    let filterDn            = userAuthResult.bindDn;
    let prefix              = ldapconf['static-group-filter-prefix'];
    let suffix              = ldapconf['static-group-filter-suffix'];
    options.filter          = `${prefix}${filterDn}${suffix}`;
    options.bindDn          = ldapconf['authenticated-bind-admin-dn'];
    options.bindCredentials = ldapconf['authenticated-bind-password'];
    options.searchBase      = ldapconf['static-group-dn'];
    options.scope           = ldapconf['static-group-scope'];
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
        logger.debug('Error during LDAP bind:', err);
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
        logger.debug(`Error during LDAP search: ${err.message || err}`);
        return reject(err);
      }
      res.on('searchEntry', entry => {
          users.push(entry.object);
          logger.debug(`LDAP Entry found: ${entry.object}`);
      });
      res.on('searchReference', referral => {
          logger.debug(`LDAP search Referral: ${referral.uris.join(',')}`);
      });
      res.on('error', err => {
          logger.debug(`LDAP Search Error: ${err.message}`);
          reject(err);
      });
      res.on('end', results => {
        let numresults = users.length;
        logger.debug(`LDAP search return ${numresults} results`);
        resolve(users);
      });
    })
  });
}

function authSearchDN (client, options, user, pass) {
  let userauth = options.userAuth;
  let userDn;

  userauth.filter = generateDN(user, userauth.filter);

  let p = options.authenticatedBind
          ? bind(client, options.bindDn, options.bindCredentials)
          : Promise.resolve();

  return p.then(() => search(client, userauth))
    .then(users => {
      let len = users.length;
      if (len === 1) {
        userDn = users[0].dn;
        return bind(client, userDn, pass);
      }
      else if (len === 0) {
        let msg = `No user matching ${userauth.filter} found`;
        logger.debug(msg);
        throw new Error(msg);
      }
      else {
        let msg = `Too many results found: ${users.map(u => u.dn).join(';')}`;
        logger.debug(msg);
        throw new Error(msg);
      }
    })
    .then(res => {
      return {
        bindDn: userDn,
        bindCredentials: pass,
        groupAuth: {
          searchBase: userDn,
          filterPrefix: '',
          scope: '',
          sizeLimit: 1,
          attributes: ['dn']
        }
      };
    });
}

function authComposeDN (client, options, user, pass) {
  let userDn = generateDN(user, options.bindDn);
  return bind(client, userDn, pass)
    .then(res => {
      return {
        bindDn: userDn,
        bindCredentials: pass,
        groupAuth: {
          searchBase: userDn,
          filterPrefix: '',
          scope: '',
          sizeLimit: 1,
          attributes: ['dn']
        }
      };
    });
}

function authComposeUPN (client, options, user, pass) {
  let userauth = options.userAuth;
  let bindDn = generateDN(user, options.bindDn);
  return bind(client, bindDn, pass)
    .then(() => search(client, userauth))
    .then(users => {
      if (users.length === 0) {
        let msg = 'Search returned no results';
        logger.debug(msg);
        throw new Error(msg);
      }
      let user = users[0];
      return {
        bindDn: bindDn,
        bindCredentials: pass,
        groupAuth: {
          searchBase: user.defaultNamingContext,
          filterPrefix: `(userPrincipleName=${bindDn})`,
          scope: 'sub',
          sizeLimit: 1,
          attributes: ['dn']
        }
      };
    });
}

function groupAuth (client, options, userAuthResult) {
  let groupAuthOptions = parseGroupAuthOptions(options, userAuthResult);

  if (!groupAuthOptions)
    return Promise.resolve();

  return bind(client, groupAuthOptions.bindDn, groupAuthOptions.bindCredentials)
    .then(() => search(client, groupAuthOptions));
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
      logger.debug(`Error when connecting to LDAP server: ${err.message || err}`);
      throw err;
    });

    return authfn(client, options, user, pass)
      .then(userAuthResult => {
        logger.debug('Authentication successful!');
        return groupAuth(client, opts, userAuthResult);
      })
      .then(() => {
        logger.debug('Authorization successful!');
        client.unbind(err => {
          if (err)
            logger.debug(`Error during LDAP unbind: ${err.message || err}`);
          client = null;
        });
        return true;
      })
      .catch(err => {
        logger.debug(`Authentication failed: ${err.message || err}`);
        client.unbind(err => {
          if (err)
            logger.debug(`Error during LDAP unbind: ${err.message || err}`);
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

