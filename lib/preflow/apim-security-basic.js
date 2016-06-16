// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var request = require('request');
var dsc = require('../../datastore/client');
var configureTls = require('./configure-tls');
var BasicLdap = require('./basic-ldap');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({loc: 'microgateway:preflow:apim-security-basic'});

function evalBasic(ctx, descriptor, securityReq, securityDef, filters, callback) {
  if (securityDef.type !== 'basic') {
    logger.error('evalBasic error: Unexpected security definition type!',
          '(Expected \'basic\', got \'%s\')', securityDef.type);
    return callback(false);
  }

  var snapshotId = descriptor['snapshot-id'];
  var authObj = ctx.get('request.authorization');
  basicAuth(snapshotId, securityDef, authObj, function(error) {
    if (!error) {
      return callback(true);
    }

    //When the error is a number, could be HTTP status code or LDAP error 49
    if (typeof error === 'number') {
        ctx.set('error.status.code', 401);
        ctx.set('error.headers.WWW-Authenticate', 'Basic realm="APIConnect"');
    }

    logger.error('evalBasic error: %s', error);
    return callback(false);
  });
}

/**
 * Do the basic authentication.
 *
 * The done is a callback with one argument 'error'. The error could be the
 * response code (number) returned from HTTP or any unexpected failure.
 *
 * @authCfg is a securityDefinition object
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 */
function basicAuth(snapshotId, authCfg, authObj, done) {
  var error;
  if ((authObj && authObj.scheme) !== 'Basic') {
    error = 'Basic authorization data not found';
    logger.error(error);
    return done(error);
  }

  //Handle the user registry cases
  var authreg = authCfg['x-ibm-authentication-registry'];
  if (authreg) {
    if (typeof authreg !== 'string') {
      error = 'Security definition provided an invalid auth registry.'
      logger.error(error, authreg);
      return done(error);
    }

    registryBasicAuth(authObj, authreg, snapshotId, function (error) {
      return done(error);
    });

    return;
  }

  //Otherwise, the auth URL cases
  var authurl = authCfg['x-ibm-authentication-url'] &&
      authCfg['x-ibm-authentication-url'].url;

  if (!authurl || typeof authurl !== 'string') {
    error = 'Security definition provided an invalid auth URL.';
    logger.error(error, authurl);
    return done(error);
  }

  //ldap://ldap.example.com/cn=John%20Doe,dc=example,dc=com
  if (/^ldaps?:\/\//.test(authurl)) {
    //TODO: need to support the ldap:// protocol without the user registry
    error = 'TODO: LDAP protocol is not supported yet: ' + authurl;
    logger.error(error)
    return done(error);
  } else if (authurl.indexOf('http://') === 0) {
    httpBasicAuth(authObj, authurl, function(error) {
      return done(error);
    });
  } else if (authurl.indexOf('https://') === 0) {
    var tlsProfileName = authCfg['x-ibm-authentication-url']['tls-profile'];
    if (typeof tlsProfileName !== 'string') {
      error = 'HTTPS authentication requires a TLS Profile name.';
      logger.error(error);
      return done(error);
    }

    httpsBasicAuth(authObj, authurl, snapshotId, tlsProfileName,
      function (error) { return done(error); });
  } else {
    error = 'Unsupported basic authentication configuration: ' +
        JSON.stringify(authCfg);
    logger.error(error)
    return done(error);
  }
}

function _httpBasicAuthCB(done) {
  return function (err, res) {
    if (!err) {
      if (res.statusCode < 400) {
        return done();
      } else {
        logger.error('Basic Auth failed with status code', res.statusCode);
        return done(res.statusCode);
      }
    }

    logger.error('Basic Auth failed with unexpected error', err);
    return done(err);
 };
}

/**
 * Do the basic authentication over HTTP.
 *
 * The done is a callback with one argument 'error'. The error could be the
 * response code (number) returned from HTTP or any unexpected failure.
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 */
function httpBasicAuth(authObj, authURL, done) {
  var options = {
      url: authURL,
      timeout: 120000,
      headers: { 'Authorization': authObj.scheme + ' ' + authObj.token },
  };

  request(options, _httpBasicAuthCB(done));
}

/**
 * Do the basic authentication over HTTPS.
 *
 * The done is a callback with one argument 'error'. The error could be the
 * response code (number) returned from HTTPS or any unexpected failure.
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 */
function httpsBasicAuth(authObj, authURL, snapshotId, tlsProfileName, done) {
  var options = {
      url: authURL,
      timeout: 120000,
      headers: { 'Authorization': authObj.scheme + ' ' + authObj.token }
  };

  if (tlsProfileName) {
    dsc.getTlsProfile(snapshotId, tlsProfileName).then(
      function (tlsprofile) {
        if (Array.isArray(tlsprofile) && tlsprofile.length >= 1) {
          configureTls(options, tlsprofile[0]);
          request(options, _httpBasicAuthCB(done));
        } else {
          var error = 'TLS profile (' + tlsProfileName + ') is not found';
          logger.error(error);
          return done(error);
        }
    })
    .catch(function(error) {
      done(error || 'Error when getting TLS Profile');
    });
  }
  else {
    logger.warn("No TLS profile is provided for HTTPS connection");
    options.rejectUnauthorized = false;
    request(options, _httpBasicAuthCB(done));
  }
}

/**
 * Given the user registry name, perform the basic authentication
 *
 * @authObj is an object of { scheme: 'Basic', token: '...' }
 * @authreg the name of user registry
 * @done is a callback with one argument 'error'. The error could be an error
 * number returned from LDAP or any unexpected failure.
 */
function registryBasicAuth(authObj, authreg, snapshotId, done) {
  dsc.getRegistry(snapshotId, authreg)
    .then(function(registries) {
      if (!Array.isArray(registries) || registries.length < 1) {
        throw 'Authentication registry (' + authreg + ') is not found';
      }

      var userReg = registries.filter(
              function (r) { return !!r['ldap-config']; });
      if (userReg.length < 1) {
        throw 'User registry (' + authreg + ') is not found';
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
            throw 'No TLS profile is provided for the secured LDAP registry';
          }

          return dsc.getTlsProfile(snapshotId, tls).then(function(tlsprofile) {
            if (!Array.isArray(tlsprofile) || tlsprofile.length < 1) {
              throw 'TLS profile (' + tls + ') is not found';
            }

            // TODO jcbelles: what if we get multiple?
            regCfg.tlsprofile = tlsprofile[0];
            return ldapBasicAuth(authObj, regCfg, done);
          });
        }

        return ldapBasicAuth(authObj, regCfg, done);
      }
      else {
        //TODO: support the type of 'Auth URL', 'Local User', 'SCIM User'
        throw 'The registry of "' + regCfg.type + '" is not supported yet';
      }
    })
    .catch(function(err) {
      // This should probably result in a 500 status code
      var error = 'Unexpected error with basic auth (using registry): ' + err;
      logger.error(error);
      return done(error);
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
  return Promise.resolve(BasicLdap(ldapCfg))
    .then(function(ldapauth) {
      var authstr = (new Buffer(authObj.token, 'base64')).toString('utf-8');
      var autharr = authstr.split(':');
      logger.debug('Attempting LDAP auth for user', autharr[0]);
      return ldapauth.authenticate(autharr[0], autharr[1]);
    })
    .then(function(user) {
      // `user` should never be null or undefined, but can't hurt to check
      if (!!user)
        return done();
      return done('Unexpected error in LDAP basic auth.');
    })
    .catch(function(err) {
      if (err && !!err.dn && err.code === 49) {
        // !!err.dn === true indicates that the error came from ldapjs
        // err.code === 49 indicates invalid credentials
        // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
        logger.error('Invalid credential reported by LDAP');
        return done(err.code);
      }
      else
        logger.error(err);
        return done('LDAP error: ' + err);
    });
}

module.exports = {
  evalBasic: evalBasic,
  basicAuth: basicAuth,
  httpBasicAuth: httpBasicAuth,
  httpsBasicAuth: httpsBasicAuth,
  ldapBasicAuth: ldapBasicAuth,
  registryBasicAuth: registryBasicAuth
};
