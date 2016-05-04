// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var dsc = require('../../datastore/client');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:preflow:apim-security-basic'});
var request = require('request');
var configureTls = require('./configure-tls');
var BasicLdap = require('./basic-ldap');

module.exports = function evalBasic (ctx, descriptor, securityReq, securityDef, filters, callback) {

  if (securityDef.type !== 'basic') {
    logger.error('evalBasic error: Unexpected security definition type!',
          '(Expected \'basic\', got \'%s\')', securityDef.type);
    ctx.set('error.status.code', 500);
    callback(false);
    return;
  }

  var authurl = securityDef['x-ibm-authentication-url'] && securityDef['x-ibm-authentication-url'].url;

  if (typeof authurl !== 'string') {
    logger.error('evalBasic error: Security definition provided invalid authentication URL: %s', authurl);
    ctx.set('error.status.code', 500);
    callback(false);
    return;
  }

  var auth = ctx.get('request.authorization');
  if ((auth && auth.scheme) !== 'Basic') {
    logger.debug('Basic authorization data not found');
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
    dsc.getRegistry(descriptor['snapshot-id'], authreg)
      .then(function(registries) {
        var ldapregs;

        if (!Array.isArray(registries) || registries.length < 1)
          throw new Error('No registry with name "' + authreg + '" found!');

        ldapregs = registries.filter(function(r){ return !!r['ldap-config']; });

        if (ldapregs.length < 1)
          throw new Error('No LDAP registry with name "'+ authreg + '" found!');

        // TODO: jcbelles: should we look to see if there's any additional criteria?
        if (ldapregs.length > 1)
          logger.debug('evalBasic found ' + registries.length +' LDAP registries named "' + authreg + '". Using first');

        var config = { registry: ldapregs[0], tlsprofile: null };
        if (config.registry['ldap-config'].ssl) {
          // TODO it looks like the TLS profile name could actually be in three possible places...
          // TODO I've seen it at securityDef['x-ibm-authentication-url']['tls-profile'] or
          // TODO config.registry['tls-profile'] or config.registry['ldap-config']['tls-profile']
          // TODO ....
          var tls = config.registry['ldap-config']['tls-profile'];
          if (!tls)
            throw new Error('LDAP registry requires TLS but provides invalid profile: ' + tls);
          return dsc.getTlsProfile(descriptor['snapshot-id'], tls).then(function(tlsprofile) {
            if (!Array.isArray(tlsprofile) || tlsprofile.length < 1)
              throw new Error('No TLS profile with name "' + tls + '" found!');
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
        var result = !!user;
        callback(result);
      })
      .catch(function(err) {
        if (!!err.dn && err.code === 49) {
          // !!err.dn === true indicates that the error came from ldapjs
          // err.code === 49 indicates invalid credentials
          // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
          logger.debug('Basic Auth failed:', err);
        }
        else {
          // This should probably result in a 500 status code
          logger.error('Basic Auth failed:', err);
        }
        ctx.set('error.status.code', 401);
        callback(false);
      });
  }

  if (authurl.indexOf('http://') === 0) {
    var options = {
      url: authurl,
      timeout: 120000,
      headers: {
        'Authorization': auth.scheme + ' ' + auth.token
      }
    };
    request(options, function(err, res) {
      if (!err && res.statusCode == 200) {
        callback(true);
      }
      else if (res && res.statusCode === 401) {
        logger.debug('Basic Auth failed:', res.statusMessage);
        ctx.set('error.status.code', 401);
        callback(false);
      }
      else {
        ctx.set('error.status.code', 401);
        logger.error('Basic Auth failed:',
          err ||
          (res && res.statusMessage) ||
          'Unknown Error');
        callback(false);
      }
    });
  }

  if (authurl.indexOf('https://') === 0) {
    var tlsProfileName = securityDef['x-ibm-authentication-url']['tls-profile'];

    if (typeof tlsProfileName !== 'string')
      throw new Error('HTTPS authentication requires valid TLS Profile name!');

    dsc.getTlsProfile(descriptor['snapshot-id'], tlsProfileName)
      .then(function (tlsprofile) {
        if (!Array.isArray(tlsprofile) || tlsprofile.length < 1)
          throw new Error('No TLS profile with name "' + tls + '" found!');
        // TODO jcbelles: what if we get multiple?
        var tls = tlsprofile[0];
        var options = {
          url: authurl,
          timeout: 120000,
          headers: {
            'Authorization': auth.scheme + ' ' + auth.token
          },
          agentOptions: configureTls(tls)
        };
        request(options, function (err, res) {
          if (!err && res.statusCode == 200) {
            callback(true);
          }
          else if (res && res.statusCode === 401) {
            logger.debug('Basic Auth failed:', res.statusMessage);
            ctx.set('error.status.code', 401);
            callback(false);
          }
          else {
            ctx.set('error.status.code', 401);
            logger.error('Basic Auth failed:',
              err ||
              (res && res.statusMessage) ||
              'Unknown Error');
            callback(false);
          }
        });
      });
  }
};
