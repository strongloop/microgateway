// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var async = require('async');
var logger = require('apiconnect-cli-logger/logger.js')
         .child({ loc: 'microgateway:security-check' });

/**
 * Module: security
 *
 * Description: Provide a swagger security framework
 *
 *   This module provides the capability to evaluate a Swagger security
 *   requirement given a securityDefinition, along with input and expected
 *   values.  The caller defines handler functions for ApiKey, BasicAuth,
 *   and OAuth2.  The default handers refuse the grant of authentication
 *   regardless of the input values.
 *
 * Usage:
 *
 *  var security = require(./security);
 *  security.setApiKeyHandler(some_user_defined_handler_for_ApiKeys);
 *  security.setBasicAuthHandler(some_user_defined_handler_for_Basic_Auth);
 *  security.setOauth2Handler(some_user_defined_handler_for_Oauth2);
 *
 *  security.evalSecurity(ctx, descriptor, securityReqs, securityDefs,
 *    function(err, result) {
 *      if (result) {
 *        // Authentication succeeded
 *      } else {
 *        // Authentication failed
 *      }
 *  });
 *
 *
 * A sample handler for ApiKey:
 *
 *  function some_user_defined_handler_for_ApiKeys(
 *        descriptor, securityReq, securityDef, filters, callback) {
 *    var result = false;
 *    if ((securityDef.in === 'header' &&
 *         ((securityDef.name === 'X-IBM-Client-Id' &&
 *           filters.hdrClientId === descriptor['client-id'])))) {
 *      result = true;
 *    }
 *    callback(result);
 *  }
 *
 * Where:
 *    descriptor - object containing name/value pairs of expected values
 *    securityReq - the Swagger security requirements array object
 *    securityDef - the Swagger securityDefinitions object
 *    function - callback function to handle the evaluation result
 *
 */

module.exports = {
  evalSecurity: evalSecurity,
  setApiKeyHandler: setApiKeyHandler,
  setBasicAuthHandler: setBasicAuthHandler,
  setOauth2Handler: setOauth2Handler,
};

//initialize the eval functions with default handlers
var evalFunctions = {
  apiKey: function(ctx, descriptor, securityReq, securityDef, callback) {
    logger.warn('The default evalApikey handler is used. Will return false.');
    callback(false);
  },
  basic: function(ctx, descriptor, securityReq, securityDef, callback) {
    logger.warn('The default evalBasic handler is used. Will return false.');
    callback(false);
  },
  oauth2: function(ctx, descriptor, securityReq, securityDef, callback) {
    logger.warn('The default evalOauth2 handler is used. Will return false.');
    callback(false);
  } };

function setApiKeyHandler(handler) {
  if (handler) {
    evalFunctions.apiKey = handler;
  }
}

function setBasicAuthHandler(handler) {
  if (handler) {
    evalFunctions.basic = handler;
  }
}

function setOauth2Handler(handler) {
  if (handler) {
    evalFunctions.oauth2 = handler;
  }
}


function evalSecurity(ctx, descriptor, securityReqs, securityDefs, callback) {
  var apiName = descriptor['api-name'];
  logger.debug('evalSecurity entry. Checking requirements: %j (%s)',
          securityReqs, apiName);

  //If there are no security requirements, return true.
  var noSecurityReqs = !(securityReqs && securityReqs.length > 0);
  var evalResult = noSecurityReqs;
  var clientSecret;

  //Iterate over the security requirements, they are OR'ed so only one has to pass
  async.forEach(securityReqs,
    function(securityReq, outAsyncCB) {
      clientSecret = undefined;
      logger.debug('evalSecurity: securityReq %j (%s)', securityReq, apiName);

      //Iterate over each security scheme within this requirement. They are
      //AND'ed so all must pass for the requirement to pass
      async.forEach(Object.keys(securityReq),
        function(securityScheme, inAsyncCB) {
          //logger.debug('evalSecurity: securityScheme "%s (%s)"', securityScheme, apiName);

          var securityDef = securityDefs[securityScheme];
          if (securityDef) {
            //Evaluate this security scheme against its definition
            evalFunctions[securityDef.type](ctx, descriptor, securityReq, securityDef,
              function(pass, secret) {
                if (!pass) {
                  logger.debug('evalSecurity failed with "%s (%s)"', securityScheme, apiName);
                  //Evaulation fails. Breaking the loop
                  var schemeFailed = new Error('securityScheme failed');
                  schemeFailed.break = true;
                  return inAsyncCB(schemeFailed);
                }

                //This securityScheme evaluation has passed - try the next one
                logger.debug('evalSecurity passed with securityScheme "%s (%s)"', securityScheme, apiName);

                if (secret) { //save the client secret to return later.
                  clientSecret = secret;
                }
                inAsyncCB();
              });
          } else {
            //Missing securityDefinition
            inAsyncCB(new Error('Cannot find securityDefinition ' +
                        securityScheme + ' in ' + apiName));
          }
        }, function(err) {
          if (err) {
            if (err.break) {
              //This security scheme failed, try the next one
              outAsyncCB();
            } else {
              outAsyncCB(err);
            }
          } else {
            //This security requirement evaluation has passed - early exit now.
            logger.debug('evalSecurity passed with securityReq (%s).', apiName);

            evalResult = true;

            //Actually there is no error here. We just use it to break forEach.
            var earlyExit = new Error('securityRequirement passed');
            earlyExit.break = true;
            return outAsyncCB(earlyExit);
          }
        }); //end of inner forEach (securityScheme)
    }, function(err) {
      if (err) {
        if (err.break) {
          //Actually, the evalSecurity has passed.
          err = undefined;
        } else {
          logger.error('evalSecurity got error for "%s": %s', apiName, err);
        }
      }

      logger.debug('evalSecurity result: %s (%s)', evalResult, apiName);
      callback(err, evalResult, noSecurityReqs, clientSecret);
    }); //end of outer forEach (securityRequirement)
}
