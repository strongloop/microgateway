// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var security = require('./security');
var Promise = require('bluebird');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:security-check' });

/*
 * The "security-check" middlware filters out the API candidates whose security
 * requirements are not fulfilled. Hopefully, the candidate list would be
 * narrowed down to 1. If not, further precedence checks will be performed to
 * the final candidate.
 */
module.exports = function createSecurityCheckMiddleware(options) {
  logger.debug('security-check middleware options: ', options);
  options = options || {};

  //the 'security' module must be setup with handlers before use
  security.setApiKeyHandler(options.evalApikey);
  security.setBasicAuthHandler(options.evalBasic);
  security.setOauth2Handler(options.evalOauth2);

  return function(req, res, next) {
    var candidates = req.ctx._apis;
    var promise = Promise.resolve();

    candidates = candidates.map(function(candidate) {
      var path = candidate.path;
      var method = candidate.method;
      var securityReqs = candidate.doc.paths[path][method].security || candidate.doc.security;
      return new Promise(function(resolve, reject) {
        security.evalSecurity(req.ctx, candidate, securityReqs, candidate.doc.securityDefinitions,
          function(err, pass, noSecurityReqs, secret) {
            if (err) {
              logger.error('security-check got error from evalSecurity() for candidate (%s):',
                  currstr, err);
              return resolve(); //treat this candidate as unauthenticated. Skip it
            }
            var result;
            if (pass) {
              candidate.authenticated = pass;
              candidate.noSecurityReqs = noSecurityReqs;
              candidate.clientSecret = secret;
              result = candidate;
            }
            resolve(result);
        });
      });
    }); // candidates.map()

    Promise.all(candidates)
      .filter(function(c) { return c;})
      .then(function(matches) {
        req.ctx._apis = matches;
      })
      .then(next)
      .catch(function(e) {
        next(e);
      });
  };
}
