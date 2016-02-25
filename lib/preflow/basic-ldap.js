'use strict';

let tls = require('tls');
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

function getCiphers (profileCiphers) {
  // Based on list found here: https://www.openssl.org/docs/manmaster/apps/ciphers.html
  const cipherMappings = {
    // SSL v3.0 cipher suites.
    SSL_RSA_WITH_NULL_MD5:             'NULL-MD5',
    SSL_RSA_WITH_NULL_SHA:             'NULL-SHA',
    SSL_RSA_WITH_RC4_128_MD5:          'RC4-MD5',
    SSL_RSA_WITH_RC4_128_SHA:          'RC4-SHA',
    SSL_RSA_WITH_IDEA_CBC_SHA:         'IDEA-CBC-SHA',
    SSL_RSA_WITH_3DES_EDE_CBC_SHA:     'DES-CBC3-SHA',
    SSL_DH_DSS_WITH_3DES_EDE_CBC_SHA:  'DH-DSS-DES-CBC3-SHA',
    SSL_DH_RSA_WITH_3DES_EDE_CBC_SHA:  'DH-RSA-DES-CBC3-SHA',
    SSL_DHE_DSS_WITH_3DES_EDE_CBC_SHA: 'DHE-DSS-DES-CBC3-SHA',
    SSL_DHE_RSA_WITH_3DES_EDE_CBC_SHA: 'DHE-RSA-DES-CBC3-SHA',
    SSL_DH_anon_WITH_RC4_128_MD5:      'ADH-RC4-MD5',
    SSL_DH_anon_WITH_3DES_EDE_CBC_SHA: 'ADH-DES-CBC3-SHA',

    // TLS v1.0 cipher suites
    TLS_RSA_WITH_NULL_MD5:              'NULL-MD5',
    TLS_RSA_WITH_NULL_SHA:              'NULL-SHA',
    TLS_RSA_WITH_RC4_128_MD5:           'RC4-MD5',
    TLS_RSA_WITH_RC4_128_SHA:           'RC4-SHA',
    TLS_RSA_WITH_IDEA_CBC_SHA:          'IDEA-CBC-SHA',
    TLS_RSA_WITH_3DES_EDE_CBC_SHA:      'DES-CBC3-SHA',
    //TLS_DH_DSS_WITH_3DES_EDE_CBC_SHA: 'Not implemented.',
    //TLS_DH_RSA_WITH_3DES_EDE_CBC_SHA: 'Not implemented.',
    TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA:  'DHE-DSS-DES-CBC3-SHA',
    TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA:  'DHE-RSA-DES-CBC3-SHA',
    TLS_DH_anon_WITH_RC4_128_MD5:       'ADH-RC4-MD5',
    TLS_DH_anon_WITH_3DES_EDE_CBC_SHA:  'ADH-DES-CBC3-SHA',

    // AES ciphersuites from RFC3268, extending TLS v1.0
    TLS_RSA_WITH_AES_128_CBC_SHA:     'AES128-SHA',
    TLS_RSA_WITH_AES_256_CBC_SHA:     'AES256-SHA',
    TLS_DH_DSS_WITH_AES_128_CBC_SHA:  'DH-DSS-AES128-SHA',
    TLS_DH_DSS_WITH_AES_256_CBC_SHA:  'DH-DSS-AES256-SHA',
    TLS_DH_RSA_WITH_AES_128_CBC_SHA:  'DH-RSA-AES128-SHA',
    TLS_DH_RSA_WITH_AES_256_CBC_SHA:  'DH-RSA-AES256-SHA',
    TLS_DHE_DSS_WITH_AES_128_CBC_SHA: 'DHE-DSS-AES128-SHA',
    TLS_DHE_DSS_WITH_AES_256_CBC_SHA: 'DHE-DSS-AES256-SHA',
    TLS_DHE_RSA_WITH_AES_128_CBC_SHA: 'DHE-RSA-AES128-SHA',
    TLS_DHE_RSA_WITH_AES_256_CBC_SHA: 'DHE-RSA-AES256-SHA',
    TLS_DH_anon_WITH_AES_128_CBC_SHA: 'ADH-AES128-SHA',
    TLS_DH_anon_WITH_AES_256_CBC_SHA: 'ADH-AES256-SHA',

    // Camellia ciphersuites from RFC4132, extending TLS v1.0
    TLS_RSA_WITH_CAMELLIA_128_CBC_SHA:      'CAMELLIA128-SHA',
    TLS_RSA_WITH_CAMELLIA_256_CBC_SHA:      'CAMELLIA256-SHA',
    TLS_DH_DSS_WITH_CAMELLIA_128_CBC_SHA:   'DH-DSS-CAMELLIA128-SHA',
    TLS_DH_DSS_WITH_CAMELLIA_256_CBC_SHA:   'DH-DSS-CAMELLIA256-SHA',
    TLS_DH_RSA_WITH_CAMELLIA_128_CBC_SHA:   'DH-RSA-CAMELLIA128-SHA',
    TLS_DH_RSA_WITH_CAMELLIA_256_CBC_SHA:   'DH-RSA-CAMELLIA256-SHA',
    TLS_DHE_DSS_WITH_CAMELLIA_128_CBC_SHA:  'DHE-DSS-CAMELLIA128-SHA',
    TLS_DHE_DSS_WITH_CAMELLIA_256_CBC_SHA:  'DHE-DSS-CAMELLIA256-SHA',
    TLS_DHE_RSA_WITH_CAMELLIA_128_CBC_SHA:  'DHE-RSA-CAMELLIA128-SHA',
    TLS_DHE_RSA_WITH_CAMELLIA_256_CBC_SHA:  'DHE-RSA-CAMELLIA256-SHA',
    TLS_DH_anon_WITH_CAMELLIA_128_CBC_SHA:  'ADH-CAMELLIA128-SHA',
    TLS_DH_anon_WITH_CAMELLIA_256_CBC_SHA:  'ADH-CAMELLIA256-SHA',

    // SEED ciphersuites from RFC4162, extending TLS v1.0
    TLS_RSA_WITH_SEED_CBC_SHA:     'SEED-SHA',
    TLS_DH_DSS_WITH_SEED_CBC_SHA:  'DH-DSS-SEED-SHA',
    TLS_DH_RSA_WITH_SEED_CBC_SHA:  'DH-RSA-SEED-SHA',
    TLS_DHE_DSS_WITH_SEED_CBC_SHA: 'DHE-DSS-SEED-SHA',
    TLS_DHE_RSA_WITH_SEED_CBC_SHA: 'DHE-RSA-SEED-SHA',
    TLS_DH_anon_WITH_SEED_CBC_SHA: 'ADH-SEED-SHA',

    // GOST ciphersuites from draft-chudov-cryptopro-cptls, extending TLS v1.0
    TLS_GOSTR341094_WITH_28147_CNT_IMIT: 'GOST94-GOST89-GOST89',
    TLS_GOSTR341001_WITH_28147_CNT_IMIT: 'GOST2001-GOST89-GOST89',
    TLS_GOSTR341094_WITH_NULL_GOSTR3411: 'GOST94-NULL-GOST94',
    TLS_GOSTR341001_WITH_NULL_GOSTR3411: 'GOST2001-NULL-GOST94',

    // Additional Export 1024 and other cipher suites
    TLS_DHE_DSS_WITH_RC4_128_SHA: 'DHE-DSS-RC4-SHA',

    // Elliptic curve cipher suites.
    TLS_ECDHE_RSA_WITH_NULL_SHA:             'ECDHE-RSA-NULL-SHA',
    TLS_ECDHE_RSA_WITH_RC4_128_SHA:          'ECDHE-RSA-RC4-SHA',
    TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA:     'ECDHE-RSA-DES-CBC3-SHA',
    TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA:      'ECDHE-RSA-AES128-SHA',
    TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA:      'ECDHE-RSA-AES256-SHA',
    TLS_ECDHE_ECDSA_WITH_NULL_SHA:           'ECDHE-ECDSA-NULL-SHA',
    TLS_ECDHE_ECDSA_WITH_RC4_128_SHA:        'ECDHE-ECDSA-RC4-SHA',
    TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA:   'ECDHE-ECDSA-DES-CBC3-SHA',
    TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA:    'ECDHE-ECDSA-AES128-SHA',
    TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA:    'ECDHE-ECDSA-AES256-SHA',
    TLS_ECDH_anon_WITH_NULL_SHA:             'AECDH-NULL-SHA',
    TLS_ECDH_anon_WITH_RC4_128_SHA:          'AECDH-RC4-SHA',
    TLS_ECDH_anon_WITH_3DES_EDE_CBC_SHA:     'AECDH-DES-CBC3-SHA',
    TLS_ECDH_anon_WITH_AES_128_CBC_SHA:      'AECDH-AES128-SHA',
    TLS_ECDH_anon_WITH_AES_256_CBC_SHA:      'AECDH-AES256-SHA',

    // TLS v1.2 cipher suites
    TLS_RSA_WITH_NULL_SHA256:                  'NULL-SHA256',
    TLS_RSA_WITH_AES_128_CBC_SHA256:           'AES128-SHA256',
    TLS_RSA_WITH_AES_256_CBC_SHA256:           'AES256-SHA256',
    TLS_RSA_WITH_AES_128_GCM_SHA256:           'AES128-GCM-SHA256',
    TLS_RSA_WITH_AES_256_GCM_SHA384:           'AES256-GCM-SHA384',
    TLS_DH_RSA_WITH_AES_128_CBC_SHA256:        'DH-RSA-AES128-SHA256',
    TLS_DH_RSA_WITH_AES_256_CBC_SHA256:        'DH-RSA-AES256-SHA256',
    TLS_DH_RSA_WITH_AES_128_GCM_SHA256:        'DH-RSA-AES128-GCM-SHA256',
    TLS_DH_RSA_WITH_AES_256_GCM_SHA384:        'DH-RSA-AES256-GCM-SHA384',
    TLS_DH_DSS_WITH_AES_128_CBC_SHA256:        'DH-DSS-AES128-SHA256',
    TLS_DH_DSS_WITH_AES_256_CBC_SHA256:        'DH-DSS-AES256-SHA256',
    TLS_DH_DSS_WITH_AES_128_GCM_SHA256:        'DH-DSS-AES128-GCM-SHA256',
    TLS_DH_DSS_WITH_AES_256_GCM_SHA384:        'DH-DSS-AES256-GCM-SHA384',
    TLS_DHE_RSA_WITH_AES_128_CBC_SHA256:       'DHE-RSA-AES128-SHA256',
    TLS_DHE_RSA_WITH_AES_256_CBC_SHA256:       'DHE-RSA-AES256-SHA256',
    TLS_DHE_RSA_WITH_AES_128_GCM_SHA256:       'DHE-RSA-AES128-GCM-SHA256',
    TLS_DHE_RSA_WITH_AES_256_GCM_SHA384:       'DHE-RSA-AES256-GCM-SHA384',
    TLS_DHE_DSS_WITH_AES_128_CBC_SHA256:       'DHE-DSS-AES128-SHA256',
    TLS_DHE_DSS_WITH_AES_256_CBC_SHA256:       'DHE-DSS-AES256-SHA256',
    TLS_DHE_DSS_WITH_AES_128_GCM_SHA256:       'DHE-DSS-AES128-GCM-SHA256',
    TLS_DHE_DSS_WITH_AES_256_GCM_SHA384:       'DHE-DSS-AES256-GCM-SHA384',
    TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256:     'ECDHE-RSA-AES128-SHA256',
    TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384:     'ECDHE-RSA-AES256-SHA384',
    TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:     'ECDHE-RSA-AES128-GCM-SHA256',
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:     'ECDHE-RSA-AES256-GCM-SHA384',
    TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256:   'ECDHE-ECDSA-AES128-SHA256',
    TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384:   'ECDHE-ECDSA-AES256-SHA384',
    TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:   'ECDHE-ECDSA-AES128-GCM-SHA256',
    TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:   'ECDHE-ECDSA-AES256-GCM-SHA384',
    TLS_DH_anon_WITH_AES_128_CBC_SHA256:       'ADH-AES128-SHA256',
    TLS_DH_anon_WITH_AES_256_CBC_SHA256:       'ADH-AES256-SHA256',
    TLS_DH_anon_WITH_AES_128_GCM_SHA256:       'ADH-AES128-GCM-SHA256',
    TLS_DH_anon_WITH_AES_256_GCM_SHA384:       'ADH-AES256-GCM-SHA384',
    RSA_WITH_AES_128_CCM:                      'AES128-CCM',
    RSA_WITH_AES_256_CCM:                      'AES256-CCM',
    DHE_RSA_WITH_AES_128_CCM:                  'DHE-RSA-AES128-CCM',
    DHE_RSA_WITH_AES_256_CCM:                  'DHE-RSA-AES256-CCM',
    RSA_WITH_AES_128_CCM_8:                    'AES128-CCM8',
    RSA_WITH_AES_256_CCM_8:                    'AES256-CCM8',
    DHE_RSA_WITH_AES_128_CCM_8:                'DHE-RSA-AES128-CCM8',
    DHE_RSA_WITH_AES_256_CCM_8:                'DHE-RSA-AES256-CCM8',
    ECDHE_ECDSA_WITH_AES_128_CCM:              'ECDHE-ECDSA-AES128-CCM',
    ECDHE_ECDSA_WITH_AES_256_CCM:              'ECDHE-ECDSA-AES256-CCM',
    ECDHE_ECDSA_WITH_AES_128_CCM_8:            'ECDHE-ECDSA-AES128-CCM8',
    ECDHE_ECDSA_WITH_AES_256_CCM_8:            'ECDHE-ECDSA-AES256-CCM8',

    // Camellia HMAC-Based ciphersuites from RFC6367, extending TLS v1.2
    TLS_ECDHE_ECDSA_WITH_CAMELLIA_128_CBC_SHA256: 'ECDHE-ECDSA-CAMELLIA128-SHA256',
    TLS_ECDHE_ECDSA_WITH_CAMELLIA_256_CBC_SHA384: 'ECDHE-ECDSA-CAMELLIA256-SHA384',
    TLS_ECDHE_RSA_WITH_CAMELLIA_128_CBC_SHA256:   'ECDHE-RSA-CAMELLIA128-SHA256',
    TLS_ECDHE_RSA_WITH_CAMELLIA_256_CBC_SHA384:   'ECDHE-RSA-CAMELLIA256-SHA384',

    // Pre shared keying (PSK) ciphersuites
    PSK_WITH_NULL_SHA:                         'PSK-NULL-SHA',
    DHE_PSK_WITH_NULL_SHA:                     'DHE-PSK-NULL-SHA',
    RSA_PSK_WITH_NULL_SHA:                     'RSA-PSK-NULL-SHA',
    PSK_WITH_RC4_128_SHA:                      'PSK-RC4-SHA',
    PSK_WITH_3DES_EDE_CBC_SHA:                 'PSK-3DES-EDE-CBC-SHA',
    PSK_WITH_AES_128_CBC_SHA:                  'PSK-AES128-CBC-SHA',
    PSK_WITH_AES_256_CBC_SHA:                  'PSK-AES256-CBC-SHA',
    DHE_PSK_WITH_RC4_128_SHA:                  'DHE-PSK-RC4-SHA',
    DHE_PSK_WITH_3DES_EDE_CBC_SHA:             'DHE-PSK-3DES-EDE-CBC-SHA',
    DHE_PSK_WITH_AES_128_CBC_SHA:              'DHE-PSK-AES128-CBC-SHA',
    DHE_PSK_WITH_AES_256_CBC_SHA:              'DHE-PSK-AES256-CBC-SHA',
    RSA_PSK_WITH_RC4_128_SHA:                  'RSA-PSK-RC4-SHA',
    RSA_PSK_WITH_3DES_EDE_CBC_SHA:             'RSA-PSK-3DES-EDE-CBC-SHA',
    RSA_PSK_WITH_AES_128_CBC_SHA:              'RSA-PSK-AES128-CBC-SHA',
    RSA_PSK_WITH_AES_256_CBC_SHA:              'RSA-PSK-AES256-CBC-SHA',
    PSK_WITH_AES_128_GCM_SHA256:               'PSK-AES128-GCM-SHA256',
    PSK_WITH_AES_256_GCM_SHA384:               'PSK-AES256-GCM-SHA384',
    DHE_PSK_WITH_AES_128_GCM_SHA256:           'DHE-PSK-AES128-GCM-SHA256',
    DHE_PSK_WITH_AES_256_GCM_SHA384:           'DHE-PSK-AES256-GCM-SHA384',
    RSA_PSK_WITH_AES_128_GCM_SHA256:           'RSA-PSK-AES128-GCM-SHA256',
    RSA_PSK_WITH_AES_256_GCM_SHA384:           'RSA-PSK-AES256-GCM-SHA384',
    PSK_WITH_AES_128_CBC_SHA256:               'PSK-AES128-CBC-SHA256',
    PSK_WITH_AES_256_CBC_SHA384:               'PSK-AES256-CBC-SHA384',
    PSK_WITH_NULL_SHA256:                      'PSK-NULL-SHA256',
    PSK_WITH_NULL_SHA384:                      'PSK-NULL-SHA384',
    DHE_PSK_WITH_AES_128_CBC_SHA256:           'DHE-PSK-AES128-CBC-SHA256',
    DHE_PSK_WITH_AES_256_CBC_SHA384:           'DHE-PSK-AES256-CBC-SHA384',
    DHE_PSK_WITH_NULL_SHA256:                  'DHE-PSK-NULL-SHA256',
    DHE_PSK_WITH_NULL_SHA384:                  'DHE-PSK-NULL-SHA384',
    RSA_PSK_WITH_AES_128_CBC_SHA256:           'RSA-PSK-AES128-CBC-SHA256',
    RSA_PSK_WITH_AES_256_CBC_SHA384:           'RSA-PSK-AES256-CBC-SHA384',
    RSA_PSK_WITH_NULL_SHA256:                  'RSA-PSK-NULL-SHA256',
    RSA_PSK_WITH_NULL_SHA384:                  'RSA-PSK-NULL-SHA384',
    //PSK_WITH_AES_128_GCM_SHA256:               'PSK-AES128-GCM-SHA256',
    //PSK_WITH_AES_256_GCM_SHA384:               'PSK-AES256-GCM-SHA384',
    ECDHE_PSK_WITH_RC4_128_SHA:                'ECDHE-PSK-RC4-SHA',
    ECDHE_PSK_WITH_3DES_EDE_CBC_SHA:           'ECDHE-PSK-3DES-EDE-CBC-SHA',
    ECDHE_PSK_WITH_AES_128_CBC_SHA:            'ECDHE-PSK-AES128-CBC-SHA',
    ECDHE_PSK_WITH_AES_256_CBC_SHA:            'ECDHE-PSK-AES256-CBC-SHA',
    ECDHE_PSK_WITH_AES_128_CBC_SHA256:         'ECDHE-PSK-AES128-CBC-SHA256',
    ECDHE_PSK_WITH_AES_256_CBC_SHA384:         'ECDHE-PSK-AES256-CBC-SHA384',
    ECDHE_PSK_WITH_NULL_SHA:                   'ECDHE-PSK-NULL-SHA',
    ECDHE_PSK_WITH_NULL_SHA256:                'ECDHE-PSK-NULL-SHA256',
    ECDHE_PSK_WITH_NULL_SHA384:                'ECDHE-PSK-NULL-SHA384',
    PSK_WITH_CAMELLIA_128_CBC_SHA256:          'PSK-CAMELLIA128-SHA256',
    PSK_WITH_CAMELLIA_256_CBC_SHA384:          'PSK-CAMELLIA256-SHA384',
    DHE_PSK_WITH_CAMELLIA_128_CBC_SHA256:      'DHE-PSK-CAMELLIA128-SHA256',
    DHE_PSK_WITH_CAMELLIA_256_CBC_SHA384:      'DHE-PSK-CAMELLIA256-SHA384',
    RSA_PSK_WITH_CAMELLIA_128_CBC_SHA256:      'RSA-PSK-CAMELLIA128-SHA256',
    RSA_PSK_WITH_CAMELLIA_256_CBC_SHA384:      'RSA-PSK-CAMELLIA256-SHA384',
    ECDHE_PSK_WITH_CAMELLIA_128_CBC_SHA256:    'ECDHE-PSK-CAMELLIA128-SHA256',
    ECDHE_PSK_WITH_CAMELLIA_256_CBC_SHA384:    'ECDHE-PSK-CAMELLIA256-SHA384',
    PSK_WITH_AES_128_CCM:                      'PSK-AES128-CCM',
    PSK_WITH_AES_256_CCM:                      'PSK-AES256-CCM',
    DHE_PSK_WITH_AES_128_CCM:                  'DHE-PSK-AES128-CCM',
    DHE_PSK_WITH_AES_256_CCM:                  'DHE-PSK-AES256-CCM',
    PSK_WITH_AES_128_CCM_8:                    'PSK-AES128-CCM8',
    PSK_WITH_AES_256_CCM_8:                    'PSK-AES256-CCM8',
    DHE_PSK_WITH_AES_128_CCM_8:                'DHE-PSK-AES128-CCM8',
    DHE_PSK_WITH_AES_256_CCM_8:                'DHE-PSK-AES256-CCM8',

    // ChaCha20-Poly1305 cipher suites from draft-ietf-tls-chacha20-poly1305-04, extending TLS v1.2
    TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256:      'ECDHE-RSA-CHACHA20-POLY1305',
    TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256:    'ECDHE-ECDSA-CHACHA20-POLY1305',
    TLS_DHE_RSA_WITH_CHACHA20_POLY1305_SHA256:        'DHE-RSA-CHACHA20-POLY1305',
    TLS_PSK_WITH_CHACHA20_POLY1305_SHA256:            'PSK-CHACHA20-POLY1305',
    TLS_ECDHE_PSK_WITH_CHACHA20_POLY1305_SHA256:      'ECDHE-PSK-CHACHA20-POLY1305',
    TLS_DHE_PSK_WITH_CHACHA20_POLY1305_SHA256:        'DHE-PSK-CHACHA20-POLY1305',
    TLS_RSA_PSK_WITH_CHACHA20_POLY1305_SHA256:        'RSA-PSK-CHACHA20-POLY1305'
  };
  const availableCiphers = tls.getCiphers().map(c => c.toUpperCase());
  return profileCiphers
    .map(c => c.toUpperCase())
    .map(c => cipherMappings[c] || cipherMappings[c.replace('SSL', 'TLS')] || c)
    .filter(c => availableCiphers.indexOf(c) !== -1)
    .join(':');
}

function configureTls (tlsprofile) {
  return {
    key:     tlsprofile['private-key'],
    cert:    tlsprofile.certs.map(obj => obj.cert),
    ciphers: getCiphers(tlsprofile.ciphers),
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

