'use strict';

var dsc = require('../../datastore/client');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:preflow:apim-security-basic'});
var request = require('request');
var BasicLdap = require('./basic-ldap');

module.exports = function evalBasic (ctx, descriptor, securityReq, securityDef, filters, callback) {
  logger.debug('evalBasic entry');

  if (securityDef.type !== 'basic') {
    logger.debug('evalBasic error: Unexpected security definition type!',
          '(Expected \'basic\', got \'%s\')', securityDef.type);
    context.set('error.statusCode', 500);
    callback(false);
    return;
  }

  var authurl = securityDef['x-ibm-authentication-url'] && securityDef['x-ibm-authentication-url'].url;

  if (typeof authurl !== 'string') {
    logger.debug('evalBasic error: Security definition provided invalid authentication URL: %s', authurl);
    context.set('error.statusCode', 500);
    callback(false);
    return;
  }

  var auth = ctx.get('request.authorization');
  logger.debug('evalBasic auth:', auth);

  if ((auth && auth.scheme) !== 'Basic') {
    logger.debug('Basic authorization data not found');
    callback(false);
    return;
  }

  if (authurl.includes('ldap://') || authurl.includes('ldaps://')) {
    // TODO jcbelles: verify this is the correct source for the registry name
    var authreg = securityDef['x-ibm-authentication-registry'];
    if (typeof authreg !== 'string') {
      logger.debug('evalBasic error: Security definition provided invalid authentication registry: %s', authreg);
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
        logger.debug('evalBasic authstr:', authstr);

        var autharr = authstr.split(':');
        return ldapauth.authenticate(autharr[0], autharr[1]);
      })
      .then(function(user) {
        // `user` should never be null or undefined, but can't hurt to check
        var result = !!user;
        logger.debug('evalBasic result:', result);
        callback(result);
      })
      .catch(function(err) {
        if (!!err.dn && err.code === 49) {
          // !!err.dn === true indicates that the error came from ldapjs
          // err.code === 49 indicates invalid credentials
          // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
          logger.debug('evalBasic failed - Invalid Credentials:', err);
        }
        else {
          // This should probably result in a 500 status code
          logger.debug('evalBasic failed:', err);
        }
        callback(false);
      });
  }

  if (authurl.includes('http://')) {
    var options = {
      url: authurl,
      headers: {
        'Authorization': auth.scheme + ' ' + auth.token
      }
    };
    request(options, function(err, res) {
      if (!err && res.statusCode == 200) {
        callback(true);
      }
      else {
        callback(false);
      }
    });
  }
};
