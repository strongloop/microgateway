'use strict';

let LdapAuth = require('ldapauth-fork');
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
 *    TODO The rest might be something we can configure from the LDAP registries, but I'll look into that later
 *    cache {Boolean}
 *        Optional, default false. If true, then up to 100 credentials at a
 *        time will be cached for 5 minutes.
 *    timeout {Integer}
 *        Optional, default Infinity. How long the client should let
 *        operations live for before timing out.
 *    connectTimeout {Integer}
 *        Optional, default is up to the OS. How long the client should wait
 *        before timing out on TCP connections.
 *    tlsOptions {Object}
 *        Additional options passed to the TLS connection layer when
 *        connecting via ldaps://. See
 *        http://nodejs.org/api/tls.html#tls_tls_connect_options_callback
 *        for available options
 *    maxConnections {Integer}
 *        Whether or not to enable connection pooling, and if so, how many to
 *        maintain.
 *    checkInterval {Integer}
 *        How often to schedule health checks for the connection pool.
 *    maxIdleTime {Integer}
 *        How long a client can be idle before health-checking the connection
 *        (subject to the checkInterval frequency)
 *    includeRaw {boolean}
 *        Optional, default false. Set to true to add property '_raw'
 *        containing the original buffers to the returned user object.
 *        Useful when you need to handle binary attributes
 *    reconnect {object}
 *        Optional, node-ldap reconnect option.
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
    bindDn: null,
    bindCredentials: null,
    bindProperty: 'dn',
    searchBase: null,
    searchScope: 'sub',
    searchFilter: null,
    tlsOptions: null,
    searchAttributes: null
  };

  let authmethod = ldapconf['auth-method'];
  let authfn;

  if (ldapconf.ssl) {
    options.url = `ldaps://${ldapconf['host']}:${ldapconf['port']}`;
    options.tlsOptions = configureTls(opts.tlsprofile);
  }

  else
    options.url = `ldap://${ldapconf['host']}:${ldapconf['port']}`;

  if (ldapconf['authenticated-bind']) {
    options.bindDn          = ldapconf['authenticated-bind-admin-dn'];
    options.bindCredentials = ldapconf['authenticated-bind-password'];
  }

  if (authmethod === null || authmethod === 'searchDN') {
    let sfprefix = ldapconf['search-dn-filter-prefix'];
    let sfsuffix = ldapconf['search-dn-filter-suffix'];
    options.searchFilter = `${sfprefix}{{username}}${sfsuffix}`;
    options.searchBase   = ldapconf['search-dn-base'];
    options.searchScope  = ldapconf['search-dn-scope'];
    // https://github.ibm.com/apimesh/apim/blob/master/node/juhu/registry-ldap.js#L61
    options.searchAttributes = ['dn', 'sn', 'cn', 'mail', 'givenName'];
    authfn = (user, pass) => authSearchDN(options, user, pass);
  }

  else if (authmethod === 'composeDN' || authmethod === 'bindDN') {
    let bindprefix = ldapconf['bind-prefix'];
    let bindsuffix = ldapconf['bind-suffix'];
    options.bindDn = `${bindprefix}{{username}}${bindsuffix}`;
    authfn = (user, pass) => authComposeDN(options, user, pass);
  }

  else if (authmethod === 'composeUPN') {
    let bindsuffix = ldapconf['bind-suffix'];
    options.bindDn = `{{username}}${bindsuffix}`;
    authfn = (user, pass) => authComposeDN(options, user, pass);
  }

  else {
    // Others not currently supported
    throw new Error(`Unsupported LDAP authentication method: ${ldapconf['auth-method']}`);
  }

  return authfn;
}


function authSearchDN (options, user, pass) {
  return new Promise((resolve, reject) => {
    let ldapauth = new LdapAuth(options);
    ldapauth.authenticate(user, pass, function (err, authuser) {
      if (err)
        reject(err);
      else
        resolve(authuser);
      ldapauth.close();
    });
  });
}

function authComposeDN (options, user, pass) {
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
  return new Promise((resolve, reject) => {
    let client = ldap.createClient({ url: options.url, tlsOptions: options.tlsOptions });

    client.on('error', err => {
      debug('Error when connecting to LDAP server:', err);
      reject(err);
    });

    client.bind(generateDN(user, options.bindDn), pass, (binderr, res) => {
      if (binderr)
        debug('Error during LDAP bind:', binderr);

      client.unbind(unbinderr => {
        if (unbinderr)
          debug('Error during LDAP unbind:', unbinderr);

        if (binderr)
          reject(binderr);

        else
          resolve(res);
      });
    });
  });
}

// Export a function that returns an API object
module.exports = function (opts) {

  // Given a username and password, authenticate against LDAP
  function authenticate (user, pass) {
    return parseOptions(opts)(user, pass);
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

