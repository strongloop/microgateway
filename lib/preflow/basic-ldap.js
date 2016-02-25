'use strict';

let LdapAuth = require('ldapauth-fork');
let auth = require('basic-auth');

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
    url: undefined,
    bindDn: undefined,
    bindCredentials: undefined,
    bindProperty: 'dn',
    searchBase: undefined,
    searchScope: 'sub',
    searchFilter: undefined,
    tlsOptions: undefined
  };

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

  if (ldapconf['auth-method'] === 'searchDN') {
    let sfprefix = ldapconf['search-dn-filter-prefix'];
    let sfsuffix = ldapconf['search-dn-filter-suffix'];
    options.searchFilter = `${sfprefix}{{username}}${sfsuffix}`;
    options.searchBase   = ldapconf['search-dn-base'];
    options.searchScope  = ldapconf['search-dn-scope'];
  }

  else {
    // Others not currently supported
    throw new Error(`Unsupported LDAP authentication method: ${ldapconf['auth-method']}`);
  }

  return options;
}

function configureTls (tlsprofile) {
  return {
    key:     tlsprofile['private-key'],
    cert:    tlsprofile.certs.map(obj => obj.cert),
    // TODO jcbelles: need to be able to transpose cipher names
    //ciphers: tlsprofile.ciphers.join(':'),
    // TODO jcbelles: we probably shouldn't allow self-signed certs...
    rejectUnauthorized: false
  };
}

// Export a function that returns an API object
module.exports = function (opts, persist) {
  const options = parseOptions(opts);
  let ldap;

  if (persist === true)
    ldap = new LdapAuth(options);

  function end () {
    if (persist !== true) {
      ldap.close();
      ldap = null;
    }
  }

  // Given a username and password, authenticate against LDAP
  function authenticate (user, pass) {
    return new Promise(function (resolve, reject) {
      ldap = ldap || new LdapAuth(options);
      ldap.authenticate(user, pass, function (err, user) {
        if (err) {
          end();
          reject(err);
          return;
        }
        end();
        resolve(user);
      });
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

