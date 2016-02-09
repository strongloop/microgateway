'use strict';

/**
 * Module dependencies
 */

var async = require('async');
var debug = require('debug')('strong-gateway:preflow');
var basicldap = require('basic-ldap');

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
 *  security.evalSecurity(context, securityReqs, securityDefs,
 *    function(err, result) {
 *      if (result) {
 *        // Authentication succeeded
 *      } else {
 *        // Authentication failed
 *      }
 *  });
 *
 *  Where:
 *    context - object containing name/value pairs of expected values
 *    securityReq - the Swagger security requirements array object
 *    securityDef - the Swagger securityDefinitions object
 *    filters - object containing name/value pairs of actual values
 *              (e.g. from the request)
 *    function - callback function to handle the evaluation result
 *
 *
 *  A sample handler for ApiKey:
 *
 *  function some_user_defined_handler_for_ApiKeys(context,
 *              securityReq, securityDef, filters, callback) {
 *    var result = false;
 *    if ((securityDef.in === 'header' &&
 *         ((securityDef.name === 'X-IBM-Client-Id' &&
 *           filters.hdrClientId === context['client-id'])))) {
 *      result = true;
 *    }
 *    callback(result);
 *  }
 *
 *  Where:
 *    context - object containing name/value pairs of expected values
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

function evalApikey(context, securityReq, securityDef, filters, callback) {
  debug('evalApikey entry:');
  var result = false;
      
  debug('evalApikey result: ' + result);
  callback(result);
}

function evalBasic(context, securityReq, securityDef, filters, callback) {
  debug('evalBasic entry');

  // TODO jcbelles: This is pretty much a hack. Need to find a better way to get the authorization here.
  var auth = filters.hdrAuthorization;
  debug('evalBasic auth:', auth);

  if ((auth && auth.scheme) !== 'Basic') {
    debug('Basic authorization data not found');
    callback(false);
    return;
  }

  Promise.resolve()
    .then(() => {
      // FIXME jcbelles: I'm guessing the LDAP options should come from the data-store...
      // This will work for this commit, anyway...
      let ldapauth = require('basic-ldap')({
        url: 'ldap://localhost:1389',
        bindDn: 'cn=root',
        bindCredentials: 'secret',
        searchBase: 'ou=users,o=myhost',
        searchFilter: '(cn={{username}})',
        groupSearchBase: false
      });

      let authstr = (new Buffer(auth.token, 'base64')).toString('utf-8');
      debug('evalBasic authstr:', authstr);

      let autharr = authstr.split(':');
      return ldapauth.authenticate(autharr[0], autharr[1]);
    })
    .then(user => {
      // `user` should never be null or undefined, but can't hurt to check
      let result = !!user;
      debug('evalBasic result:', result);
      callback(result);
    })
    .catch(err => {
      if (!!err.dn && (err && err.code) === 49) {
        // FIXME jcbelles: we need some way of setting the response status code to 401
        // !!err.dn === true indicates that the error came from ldapjs
        // err.code === 49 indicates invalid credentials
        // See https://github.com/mcavage/node-ldapjs/blob/master/lib/errors/codes.js#L29
        debug('evalBasic failed - Invalid Credentials:', err);
      }
      else
        debug('evalBasic failed:', err);

      callback(false);
    });

}

function evalOauth2(context, securityReq, securityDef, filters, callback) {
  debug('evalOauth2 entry');
  var result = true;

  debug('evalOauth2 result: ' + result);
  callback(result);
}

function evalSecurity(context, securityReqs, securityDefs, filters, callback) {
  debug('evalSecurity entry');
  debug('evalSecurity context:', context);
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
            evalFunctions[securityDef.type](context, securityReq, securityDef,
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
