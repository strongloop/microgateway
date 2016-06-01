// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var dsc = require('../../datastore/client');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:preflow:apim-security-basic'});
var request = require('request');
var configureTls = require('./configure-tls');
var BasicLdap = require('./basic-ldap');

function evalBasic(ctx, descriptor, securityReq, securityDef, filters, callback) {
  if (securityDef.type !== 'basic') {
    logger.error('evalBasic error: Unexpected security definition type!',
          '(Expected \'basic\', got \'%s\')', securityDef.type);
    callback(false);
    return;
  }

  var authurl = securityDef['x-ibm-authentication-url'] && securityDef['x-ibm-authentication-url'].url;

  if (typeof authurl !== 'string') {
    logger.error('evalBasic error: Security definition provided invalid authentication URL: %s', authurl);
    callback(false);
    return;
  }

  var auth = ctx.get('request.authorization');
  if ((auth && auth.scheme) !== 'Basic') {
    logger.error('Basic authorization data not found');
    //however, when this module is used, it means basic auth is required.
    //need to response with 401 unauthorized and www-authenticate header
    ctx.set('error.status.code', 401);
    ctx.set('error.headers.WWW-Authenticate', 'Basic realm="APIConnect"');
    callback(false);
    return;
  }

  if (/^ldaps?:\/\//.test(authurl)) {
    // TODO jcbelles: verify this is the correct source for the registry name
    var authreg = securityDef['x-ibm-authentication-registry'];
    if (typeof authreg !== 'string') {
      logger.error('evalBasic error: Security definition provided invalid authentication registry: %j', authreg);
      callback(false);
      return;
    }

    ldapsBasicAuth(auth, authreg, descriptor['snapshot-id'], function(error) {
      if (!error) {
        return callback(true);
      }

      //check if it is LDAP error 49
      if (typeof error === 'number' && error === 49) {
          ctx.set('error.status.code', 401);
          ctx.set('error.headers.WWW-Authenticate', 'Basic realm="APIConnect"');
          return callback(false);
      }

      return callback(false);
    });
  } else if (authurl.indexOf('http://') === 0) {
    httpBasicAuth(auth, authurl, function(error) {
      if (!error) {
        return callback(true);
      }

      if (typeof error === 'number') {
          ctx.set('error.status.code', error);
          if (error === 401)
              ctx.set('error.headers.WWW-Authenticate', 'Basic realm="APIConnect"');
          return callback(false);
      }

      return callback(false);
    });
  } else if (authurl.indexOf('https://') === 0) {
    var tlsProfileName = securityDef['x-ibm-authentication-url']['tls-profile'];
    if (typeof tlsProfileName !== 'string') {
      logger.error('HTTPS authentication requires a TLS Profile name.');
      return callback(false);
    }

    httpsBasicAuth(auth, authurl, descriptor['snapshot-id'], tlsProfileName,
      function(error) {
        if (!error) {
          return callback(true);
        }

        if (typeof error === 'number') {
            ctx.set('error.status.code', error);
            if (error === 401)
                ctx.set('error.headers.WWW-Authenticate', 'Basic realm="APIConnect"');
            return callback(false);
        }

        return callback(false);
    });
  }
};

/**
 * Do the basic authentication over HTTP.
 *
 * The done is a callback with one argument 'error'. The error could be the
 * response code (number) returned from HTTP or any unexpected failure.
 */
function httpBasicAuth(auth, authURL, done) {
  var options = {
      url: authURL,
      timeout: 120000,
      headers: { 'Authorization': auth.scheme + ' ' + auth.token },
  };

  request(options, function (err, res) {
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
  });
}

/**
 * Do the basic authentication over HTTPS.
 *
 * The done is a callback with one argument 'error'. The error could be the
 * response code (number) returned from HTTPS or any unexpected failure.
 */
function httpsBasicAuth(auth, authURL, snapshotId, tlsProfileName, done) {
  dsc.getTlsProfile(snapshotId, tlsProfileName).then(
    function (tlsprofile) {
      if (Array.isArray(tlsprofile) && tlsprofile.length >= 1) {
        var tls = tlsprofile[0];
        var options = {
            url: authURL,
            timeout: 120000,
            headers: { 'Authorization': auth.scheme + ' ' + auth.token },
            agentOptions: configureTls(tls)
        };

        request(options, function (err, res) {
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
        });
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

/**
 * Do the basic authentication over LDAP.
 *
 * The done is a callback with one argument 'error'. The error could be an error
 * number returned from LDAP or any unexpected failure.
 */
function ldapsBasicAuth(auth, authreg, snapshotId, done) {
  dsc.getRegistry(snapshotId, authreg)
    .then(function(registries) {
      if (!Array.isArray(registries) || registries.length < 1) {
        throw 'Authentication registry (' + authreg + ') is not found';
      }

      var ldapregs = registries.filter(
              function (r) { return !!r['ldap-config']; });
      if (ldapregs.length < 1) {
        throw 'LDAP registry (' + authreg + ') is not found';
      }
      if (ldapregs.length > 1) {
        // TODO: jcbelles: if there's any additional criteria?
        logger.warn('More than one LDAP registries named "' + authreg + '" is found');
      }

      var config = { registry: ldapregs[0], tlsprofile: undefined };
      if (ldapregs[0]['ldap-config'].ssl) {
        // TODO it looks like the TLS profile name could actually be in three possible places...
        // TODO I've seen it at securityDef['x-ibm-authentication-url']['tls-profile'] or
        // TODO config.registry['tls-profile'] or config.registry['ldap-config']['tls-profile']
        // TODO ....
        var tls = ldapregs[0]['ldap-config']['tls-profile'];
        if (!tls) {
          throw 'No TLS profile is provided for the secured LDAP registry';
        }

        return dsc.getTlsProfile(snapshotId, tls).then(function(tlsprofile) {
          if (!Array.isArray(tlsprofile) || tlsprofile.length < 1) {
            throw 'TLS profile (' + tls + ') is not found';
          }

          // TODO jcbelles: what if we get multiple?
          config.tlsprofile = tlsprofile[0];
          return BasicLdap(config);
        });
      }

      return BasicLdap(config);
    })
    .then(function(ldapauth) {
      var authstr = (new Buffer(auth.token, 'base64')).toString('utf-8');
      var autharr = authstr.split(':');
      logger.debug('Attempting LDAP auth for user', autharr[0]);
      return ldapauth.authenticate(autharr[0], autharr[1]);
    })
    .then(function(user) {
      // `user` should never be null or undefined, but can't hurt to check
      if (!!user)
        return done();
      return done('Unexpected error in LDAP authentication.');
    })
    .catch(function(err) {
      if (err && !!err.dn && err.code === 49) {
        // !!err.dn === true indicates that the error came from ldapjs
        // err.code === 49 indicates invalid credentials
        // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
        logger.error("Invalid credential reported by LDAP");
        done(err.code);
      }
      else {
        // This should probably result in a 500 status code
        var error = 'Unexpected error during authentication: ' + err;
        logger.error(error);
        return done(error);
      }
    });
}

module.exports = {
  evalBasic: evalBasic,
  httpBasicAuth: httpBasicAuth,
  httpsBasicAuth: httpsBasicAuth,
  ldapsBasicAuth: ldapsBasicAuth
};
