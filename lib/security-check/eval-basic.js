// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var request = require('request');
var Promise = require('bluebird');
var dsc = require('../../datastore/client');
var configureTls = require('./configure-tls');
var BasicLdap = require('./basic-ldap');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:security-check:eval-basic' });

function evalBasic(ctx, descriptor, securityReq, securityDef, callback) {
  if (securityDef.type !== 'basic') {
    logger.error('evalBasic error: unexpected security definition type!',
          '(Expected \'basic\', got \'%s\')', securityDef.type);
    return callback(false);
  }

  var snapshotId = descriptor['snapshot-id'];
  var authObj = ctx.get('request.authorization');
  basicAuth(snapshotId, securityDef, authObj, function(error) {
    if (!error) {
      return callback(true);
    }

    //When the error.statusCode is a number, could be HTTP status code or the
    //LDAP error 49.
    if (error.statusCode === 401) {
      ctx.set('error.status.code', 401);
      ctx.set('error.headers.WWW-Authenticate', 'Basic realm="apim"');
    }

    logger.error('evalBasic error: %s', error);
    return callback(false);
  });
}

/**
 * Do the basic authentication.
 *
 * The done is a callback with one argument 'error'. Check the error.statusCode
 * for the response code (number) returned from HTTP.
 *
 * @authCfg is a securityDefinition object
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 */
function basicAuth(snapshotId, authCfg, authObj, done) {
  var retError;
  if (_.isUndefined(authObj)) {
    logger.error('Authentication is required');
    retError = new Error('Authentication is required');
    retError.statusCode = 401;
    return done(retError);
  }

  if ((authObj && authObj.scheme) !== 'Basic') {
    logger.error('Basic authorization data not found');
    retError = new Error('Basic authorization data not found');
    retError.statusCode = 401;
    return done(retError);
  }

  //Handle the user registry cases
  var authreg = authCfg['x-ibm-authentication-registry'];
  if (authreg) {
    if (typeof authreg !== 'string') {
      logger.error('Security definition provided an invalid auth registry.', authreg);

      retError = new Error('Security definition provided an invalid auth registry.');
      retError.statusCode = 500;
      return done(retError);
    }

    registryBasicAuth(authObj, authreg, snapshotId, function(error) {
      return done(error);
    });

    return;
  }

  //Otherwise, the auth URL cases
  var authurl = authCfg['x-ibm-authentication-url'] &&
      authCfg['x-ibm-authentication-url'].url;

  if (!authurl || typeof authurl !== 'string') {
    logger.error('Security definition provided an invalid auth URL.', authurl);

    retError = new Error('Security definition provided an invalid auth URL.');
    retError.statusCode = 500;
    return done(retError);
  }

  //ldap://ldap.example.com/cn=John%20Doe,dc=example,dc=com
  if (/^ldaps?:\/\//.test(authurl)) {
    //TODO: need to support the ldap:// protocol without the user registry
    logger.error('TODO: LDAP protocol is not supported yet:', authurl);

    retError = new Error('LDAP protocol is not supported yet');
    retError.statusCode = 500;
    return done(retError);
  } else if (authurl.indexOf('http://') === 0) {
    httpBasicAuth(authObj, authurl, function(error) {
      return done(error);
    });
  } else if (authurl.indexOf('https://') === 0) {
    var tlsProfileName = authCfg['x-ibm-authentication-url']['tls-profile'];

    httpsBasicAuth(authObj, authurl, snapshotId, tlsProfileName,
      function(error) { return done(error); });
  } else {
    logger.error('Unsupported basic authentication configuration' +
        JSON.stringify(authCfg));

    retError = new Error('Unsupported basic authentication configuration');
    retError.statusCode = 500;
    return done(retError);
  }
}

function _httpBasicAuthCB(done) {
  return function(err, res) {
    var retError;
    if (!err) {
      if (res.statusCode < 400) {
        return done();
      } else {
        logger.error('Basic Auth failed with status code', res.statusCode);

        retError = new Error('Basic Auth failed');
        retError.statusCode = res.statusCode;
        return done(retError);
      }
    }

    logger.error('Basic Auth failed with unexpected error', err);
    retError = new Error(err);
    retError.statusCode = 500;
    return done(retError);
  };
}

/**
 * Do the basic authentication over HTTP.
 *
 * The done is a callback with one argument 'error'. Check the error.statusCode
 * for the response code (number) returned from HTTP.
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 */
function httpBasicAuth(authObj, authURL, done) {
  var options = {
    url: authURL,
    timeout: 300000,
    headers: { Authorization: authObj.scheme + ' ' + authObj.token } };

  request(options, _httpBasicAuthCB(done));
}

/**
 * Do the basic authentication over HTTPS.
 *
 * The done is a callback with one argument 'error'. Check the error.statusCode
 * for the response code (number) returned from HTTP.
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 */
function httpsBasicAuth(authObj, authURL, snapshotId, tlsProfileName, done) {
  var options = {
    url: authURL,
    timeout: 300000,
    headers: { Authorization: authObj.scheme + ' ' + authObj.token } };

  var retError;
  if (tlsProfileName) {
    dsc.getTlsProfile(snapshotId, tlsProfileName).then(function(tlsprofile) {
      if (Array.isArray(tlsprofile) && tlsprofile.length >= 1) {
        _.extend(options, configureTls(tlsprofile[0]));
        request(options, _httpBasicAuthCB(done));
      } else {
        logger.error('TLS profile (', tlsProfileName, ') is not found');

        retError = new Error('Server error');
        retError.statusCode = 500;
        return done(retError);
      }
    })
    .catch(function(error) {
      retError = new Error(error || 'Error when getting TLS Profile');
      retError.statusCode = 500;
      done(retError);
    });
  } else {
    logger.warn('No TLS profile is provided for HTTPS connection');
    options.rejectUnauthorized = false;
    request(options, _httpBasicAuthCB(done));
  }
}

/**
 * Given the user registry name, perform the basic authentication
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 * @authreg the name of user registry
 * @done is a callback with one argument 'error'. The error.statusCode contains
 * the error number returned from LDAP.
 */
function registryBasicAuth(authObj, authreg, snapshotId, done) {
  var retError;
  dsc.getRegistry(snapshotId, authreg)
    .then(function(registries) {
      if (!Array.isArray(registries) || registries.length < 1) {
        retError = new Error('Authentication registry (' + authreg + ') is not found');
        retError.statusCode = 500;
        throw retError;
      }

      var userReg = registries.filter(function(r) { return !!r['ldap-config']; });
      if (userReg.length < 1) {
        retError = new Error('User registry (' + authreg + ') is not found');
        retError.statusCode = 500;
        throw retError;
      }
      if (userReg.length > 1) {
        // TODO: jcbelles: if there's any additional criteria?
        logger.warn('More than one User registries named "' + authreg + '" is found');
      }

      var regCfg = { registry: userReg[0],
                     type: userReg[0].type,
                     tlsprofile: undefined };

      if (regCfg.type === 'ldap') {
        if (userReg[0]['ldap-config'].ssl) {
          // TODO it looks like the TLS profile name could actually be in three possible places...
          // TODO I've seen it at securityDef['x-ibm-authentication-url']['tls-profile'] or
          // TODO config.registry['tls-profile'] or config.registry['ldap-config']['tls-profile']
          // TODO ....
          var tls = userReg[0]['ldap-config']['tls-profile'];
          if (!tls) {
            retError = new Error('No TLS profile is provided for the secured LDAP registry');
            retError.statusCode = 500;
            throw retError;
          }

          return dsc.getTlsProfile(snapshotId, tls).then(function(tlsprofile) {
            if (!Array.isArray(tlsprofile) || tlsprofile.length < 1) {
              retError = new Error('TLS profile (' + tls + ') is not found');
              retError.statusCode = 500;
              throw retError;
            }

            // TODO jcbelles: what if we get multiple?
            regCfg.tlsprofile = tlsprofile[0];
            return ldapBasicAuth(authObj, regCfg, done);
          });
        }

        return ldapBasicAuth(authObj, regCfg, done);
      } else {
        //TODO: support the type of 'Auth URL', 'Local User', 'SCIM User'
        retError = new Error('The registry of "' + regCfg.type + '" is not supported yet');
        retError.statusCode = 500;
        throw retError;
      }
    })
    .catch(function(err) {
      // This should probably result in a 500 status code
      logger.error('Unexpected error with basic auth (using registry):', err);
      return done(err);
    });
}

/**
 * Do the basic authentication over LDAP config object.
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 * @ldapCfg the registry object of type 'ldap'
 * @done is a callback with one argument 'error' returned from LDAP server.
 */
function ldapBasicAuth(authObj, ldapCfg, done) {
  var retError;
  return Promise.resolve(BasicLdap(ldapCfg))
    .then(function(ldapauth) {
      var authstr = (new Buffer(authObj.token, 'base64')).toString('utf-8');
      var autharr = authstr.split(':');
      logger.debug('Attempting LDAP auth for user', autharr[0]);
      return ldapauth.authenticate(autharr[0], autharr[1]);
    })
    .then(function(user) {
      // `user` should never be null or undefined, but can't hurt to check
      if (user) {
        return done();
      }
      logger.error('Unexpected error in LDAP basic auth.');

      retError = new Error('Unexpected error in LDAP basic auth.');
      retError.statusCode = 500;
      return done(retError);
    })
    .catch(function(err) {
      if (err && (err.code === 49 || err.code === 32)) {
        // err.code === 49 indicates invalid credentials
        // err.code === 32 indicates no such object
        // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
        logger.error('Invalid user/credential reported by LDAP, code:', err.code);

        retError = new Error('Invalid user/credential');
        retError.statusCode = 401;
        return done(retError);
      } else {
        logger.error('LDAP error:', err);

        retError = new Error('LDAP error');
        retError.statusCode = 500;
        return done(retError);
      }
    });
}

module.exports = {
  evalBasic: evalBasic,
  basicAuth: basicAuth,
  httpBasicAuth: httpBasicAuth,
  httpsBasicAuth: httpsBasicAuth,
  ldapBasicAuth: ldapBasicAuth,
  registryBasicAuth: registryBasicAuth };
