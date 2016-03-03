'use strict';

let dsc = require('../../datastore/client');
let debug = require('debug')('micro-gateway:preflow:basic-auth');
let request = require('request');
let BasicLdap = require('./basic-ldap');

module.exports = function evalBasic (ctx, descriptor, securityReq, securityDef, filters, callback) {
  debug('evalBasic entry');

  if (securityDef.type !== 'basic') {
    debug('evalBasic error: Unexpected security definition type!',
          `(Expected 'basic', got '${securityDef.type})'`);
    context.set('error.statusCode', 500);
    callback(false);
    return;
  }

  const authurl = securityDef['x-ibm-authentication-url'] && securityDef['x-ibm-authentication-url'].url;

  if (typeof authurl !== 'string') {
    debug(`evalBasic error: Security definition provided invalid authentication URL: ${authurl}`);
    context.set('error.statusCode', 500);
    callback(false);
    return;
  }

  const auth = ctx.get('request.authorization');
  debug('evalBasic auth:', auth);

  if ((auth && auth.scheme) !== 'Basic') {
    debug('Basic authorization data not found');
    callback(false);
    return;
  }

  if (authurl.includes('ldap://') || authurl.includes('ldaps://')) {
    // TODO jcbelles: verify this is the correct source for the registry name
    const authreg = securityDef['x-ibm-authentication-registry'];
    if (typeof authreg !== 'string') {
      debug(`evalBasic error: Security definition provided invalid authentication registry: ${authreg}`);
      callback(false);
      return;
    }
    dsc.getRegistry(descriptor['snapshot-id'], authreg)
      .then(registries => {
        let ldapregs;

        if (!Array.isArray(registries) || registries.length < 1)
          throw new Error(`No registry with name "${authreg}" found!`);

        ldapregs = registries.filter(r => !!r['ldap-config']);

        if (ldapregs.length < 1)
          throw new Error(`No LDAP registry with name "${authreg}" found!`);

        // TODO: jcbelles: should we look to see if there's any additional criteria?
        if (ldapregs.length > 1)
          debug(`evalBasic found ${registries.length} LDAP registries named "${authreg}". Using first`);

        let config = { registry: ldapregs[0], tlsprofile: null };
        if (config.registry['ldap-config'].ssl) {
          let tls = config.registry['ldap-config']['tls-profile'];
          if (!tls)
            throw new Error(`LDAP registry requires TLS but provides invalid profile: ${tls}`);
          return dsc.getTlsProfile(descriptor['snapshot-id'], tls).then(tlsprofile => {
            if (!Array.isArray(tlsprofile) || tlsprofile.length < 1)
              throw new Error(`No TLS profile with name "${tls}" found!`);
            // TODO jcbelles: what if we get multiple?
            config.tlsprofile = tlsprofile[0];
            return BasicLdap(config);
          });
        }

        return BasicLdap(config);
      })
      .then((ldapauth) => {

        const authstr = (new Buffer(auth.token, 'base64')).toString('utf-8');
        debug('evalBasic authstr:', authstr);

        const autharr = authstr.split(':');
        return ldapauth.authenticate(autharr[0], autharr[1]);
      })
      .then(user => {
        // `user` should never be null or undefined, but can't hurt to check
        let result = !!user;
        debug('evalBasic result:', result);
        callback(result);
      })
      .catch(err => {
        if (!!err.dn && err.code === 49) {
          // !!err.dn === true indicates that the error came from ldapjs
          // err.code === 49 indicates invalid credentials
          // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
          debug('evalBasic failed - Invalid Credentials:', err);
        }
        else {
          // This should probably result in a 500 status code
          debug('evalBasic failed:', err);
        }
        callback(false);
      });
  }

  if (authurl.includes('http://')) {
    var options = {
      url: authurl,
      headers: {
        'Authorization': `${auth.scheme} ${auth.token}`
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
