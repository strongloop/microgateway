'use strict';

/**
 * Module dependencies
 */

var async = require('async');
var dsc = require('../../datastore/client');
var debug = require('debug')('micro-gateway:preflow');
var request = require('request');
var BasicLdap = require('./basic-ldap');

/*****************************************************************************
 *
 * Module: apim-security
 *
 * Description: Provide a swagger security framework
 *
 *   This module provides the capability to evaluate a Swagger security
 *   requirement given a securityDefinition, along with input and expected
 *   values.  The caller defines handler functions for ApiKey, BasicAuth,
 *   and Oauth2.  The default handers grant authentication regardless of
 *   the input values.
 *
 * Usage:
 *
 *  var security = require(./apim-security);
 *  security.setApiKeyHandler(some_user_defined_handler_for_ApiKeys);
 *  security.setBasicAuthHandler(some_user_defined_handler_for_Basic_Auth);
 *  security.setOauth2Handler(some_user_defined_handler_for_Oauth2);
 *  security.evalSecurity(ctx, descriptor, securityReqs, securityDefs,
 *    function(err, result) {
 *      if (result) {
 *        // Authentication succeeded
 *      } else {
 *        // Authentication failed
 *      }
 *  });
 *
 *  Where:
 *    descriptor - object containing name/value pairs of expected values
 *    securityReq - the Swagger security requirements array object
 *    securityDef - the Swagger securityDefinitions object
 *    filters - object containing name/value pairs of actual values
 *              (e.g. from the request)
 *    function - callback function to handle the evaluation result
 *
 *
 *  A sample handler for ApiKey:
 *
 *  function some_user_defined_handler_for_ApiKeys(descriptor,
 *              securityReq, securityDef, filters, callback) {
 *    var result = false;
 *    if ((securityDef.in === 'header' &&
 *         ((securityDef.name === 'X-IBM-Client-Id' &&
 *           filters.hdrClientId === descriptor['client-id'])))) {
 *      result = true;
 *    }
 *    callback(result);
 *  }
 *
 *  Where:
 *    descriptor - object containing name/value pairs of expected values
 *    securityReq - the Swagger security requirements array object
 *    securityDef - the Swagger securityDefinitions object
 *    filters - object containing name/value pairs of actual values
 *              (e.g. from the request)
 *    callback - callback containing the authentication result (true/false)
 *
 *****************************************************************************/


/**
 * Module exports
 */
module.exports = {
  evalSecurity: evalSecurity,
  setApiKeyHandler: setApiKeyHandler,
  setBasicAuthHandler: setBasicAuthHandler,
  setOauth2Handler: setOauth2Handler,
};

var evalFunctions = {
  apiKey: evalApikey,
  basic: evalBasic,
  oauth2: evalOauth2,
};

function setApiKeyHandler(handler) {
  if (handler) {
    evalFunctions.apiKey = handler;
  } else {
    evalFunctions.apiKey = evalApikey;
  }
}

function setBasicAuthHandler(handler) {
  if (handler) {
    evalFunctions.basic = handler;
  } else {
    evalFunctions.basic = evalBasic;
  }
}

function setOauth2Handler(handler) {
  if (handler) {
    evalFunctions.oauth2 = handler;
  } else {
    evalFunctions.oauth2 = evalOauth2;
  }
}

function evalApikey(ctx, descriptor, securityReq, securityDef, filters, callback) {
  debug('evalApikey entry:');
  var result = false;
      
  debug('evalApikey result: ' + result);
  callback(result);
}

function evalBasic(ctx, descriptor, securityReq, securityDef, filters, callback) {
  let debug = require('debug')('micro-gateway:preflow:basic-auth');
  debug('evalBasic entry');

  if (securityDef.type !== 'basic') {
    debug('evalBasic error: Unexpected security definition type!',
          `(Expected 'basic', got '${securityDef.type})'`);
    callback(false);
    return;
  }

  const authurl = securityDef['x-ibm-authentication-url'] && securityDef['x-ibm-authentication-url'].url;

  if (typeof authurl !== 'string') {
    debug(`evalBasic error: Security definition provided invalid authentication URL: ${authurl}`);
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
}

function evalOauth2(ctx, descriptor, securityReq, securityDef, filters, callback) {
  debug('evalOauth2 entry');
  var result = true;

  debug('evalOauth2 result: ' + result);
  callback(result);
}

function evalSecurity(ctx, descriptor, securityReqs, securityDefs, filters, callback) {
  debug('evalSecurity entry');
  debug('evalSecurity descriptor:', descriptor);
  debug('evalSecurity filters:', filters);
  debug('evalSecurity securityReqs:', securityReqs);
  debug('evalSecurity securityDefs:', securityDefs);

  // If there are no security requirements, return true otherwise assume false
  var evalResult = !(securityReqs && securityReqs.length > 0);

  // Iterate over the security req's, they are OR'ed so only one has to pass
  async.forEach(securityReqs,
    function(securityReq, reqCB) {
      debug('evalSecurity securityReq:', securityReq);

      // Iterate over each security scheme within this requirement.  They are
      // AND'ed so all must pass for the requirement to pass
      async.forEach(Object.keys(securityReq),
        function(securityDefName, defCB) {
          debug('evalSecurity securityDefName:', securityDefName);
          var securityDef = securityDefs[securityDefName];
          if (securityDef) {
            // Evaluate this security scheme against its definition
            evalFunctions[securityDef.type](ctx, descriptor, securityReq, securityDef,
              filters,
              function(secDefResult) {
                if (!secDefResult) {
                  // This security definition evaluation has failed - break loop
                  var fakeErr = new Error();
                  fakeErr.break = true;
                  debug('evalSecurity: securityDef eval failed');
                  return defCB(fakeErr);
                }

                // This securityDef evaluation has passed - try the next one
                debug('evalSecurity: security definition eval passed');
                defCB();
              });
          } else {
            // Invalid swagger - missing securityDefinition
            debug('Error: securityDefinition ' + securityDefName + ' missing');
            defCB(Error('Missing security definition: ' + securityDefName));
          }
        }, function(err) {
          if (err && err.break) {
            // This security scheme failed, try the next one
            debug('evalSecurity: security scheme eval failed');
            reqCB();
          } else {
            if (!err) {
              // This security requirement evaluation has passed - break loop
              // Since this requirement passed, the entire eval has passed
              debug('evalSecurity: security requirement eval passed');
              evalResult = true;
              var fakeErr = new Error();
              fakeErr.break = true;
              return reqCB(fakeErr);
            }
            reqCB(err);
          }
        });
    }, function(err) {
      if (err && err.break) {
        // Reset the fake error used to break the loop
        err = undefined;
      }
      debug('evalSecurity final result ' + evalResult);
      callback(err, evalResult);
    });
}
