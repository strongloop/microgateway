// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var security = require('./security');
var evalApikey = require('./eval-apikey').evalApikey;
var evalBasic = require('./eval-basic').evalBasic;
var evalOauth2 = require('./eval-oauth2').evalOauth2;
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
  security.setApiKeyHandler(evalApikey);
  security.setBasicAuthHandler(evalBasic);
  security.setOauth2Handler(evalOauth2);

  return function(req, res, next) {
    var candidates = req.ctx._apis;
    var matches = [];

    var promise = Promise.resolve();
    _.forEach(candidates, function(candidate) {
      //this string is used for logging only
      var currstr = candidate.entry['api-name'] + ',' + candidate.pathobj.path
          + ',' + (candidate.mm ? candidate.mm.method : '<preflight>');

      var match;
      promise = promise.then(function() {
        return new Promise(function(resolve, reject) {
          logger.debug('security-check candidate (%s)', currstr);
          if (!candidate.mm) {
            //This is a preflight request. Skip the security check.
            match = buildPreflowContext(candidate.entry, candidate.pathobj.path, candidate.mm);
            match.allowMethods = candidate.allowMethods;
            match.authenticated = undefined;
            match.noSecurityReqs = true;

            matches.push(match);
            return resolve();
          } else {
            //Evaluate the security reqs and defs
            var reqs = candidate.mm.securityReqs;
            var defs = candidate.mm.securityDefs;

            security.evalSecurity(req.ctx, candidate.entry, reqs, defs,
                function(err, pass, noSecurityReqs, secret) {
                  if (err) {
                    logger.error('security-check got error from evalSecurity() for candidate (%s):',
                        currstr, err);
                    return resolve(); //treat this candidate as unauthenticated. Skip it
                  }

                  if (pass) {
                    match = buildPreflowContext(candidate.entry, candidate.pathobj.path, candidate.mm);
                    match.allowMethods = candidate.allowMethods;
                    match.authenticated = pass;
                    match.noSecurityReqs = noSecurityReqs;
                    match.clientSecret = secret;

                    matches.push(match);
                  }
                  return resolve();
                });
          }
        });

      }); //end of promise
    }); //end of iteration

    //wait until the security check for all of the candidates is done
    promise.then(function() {
      logger.info('security-check: %d candidates have been narrowed down to %d',
              candidates.length, matches.length);

      var champion;
      if (matches.length > 0) {
        champion = matches[0]; //best guess
        if (matches.length > 1) {
          var planId = req.headers['x-ibm-plan-id'];
          if (planId) {
            logger.debug('security-check: check the planId=', planId);
            for (var i = 0; i < matches.length; i++) {
              if (matches[i].plan.id === planId) {
                champion = matches[i];
                break;
              }
            }
          }
        }
      }

      if (champion) {
        if (champion.noSecurityReqs === false &&
            (!champion._['subscription-active'] || champion._['subscription-app-state'] !== 'ACTIVE')) {
          logger.error('security-check: the app\'s subscription is not active.');

          //401: Unauthorized (for inactive client)
          req.ctx.set('error.status.code', 401);
          return next({ name: 'PreFlowError', message: 'Subscription is not active.' });
        } else if (champion.api.state === 'suspended') {
          logger.error('security-check: API is currently suspended.');

          //503: Service unavailable
          req.ctx.set('error.status.code', 503);
          return next({ name: 'PreFlowError', message: 'API is suspended now.' });
        } else {
          req.ctx._apis = champion;
          return next();
        }
      } else {
        logger.error('security-check failed to match to any API');

        var status = req.ctx.get('error.status.code');
        if (!status || status < 400) {
          //401: Unauthorized (for all security checks failed)
          req.ctx.set('error.status.code', 401);
        }
        return next({ name: 'PreFlowError', message: 'unable to process the request' });
      }
    });
  };

};

/**
 * Build the preflow context object.
 *
 * @param {Object} EntryMatch - object representing matching API entry
 * @param {string} PathMatch - path representing matching API path
 * @param {Object} MethodMatch - object representing matching HTTP method
 *
 * @returns {Object} - context object
 */
function buildPreflowContext(EntryMatch, PathMatch, MethodMatch) {
  //for a preflight request, the MethodMatch is undefined
  MethodMatch = MethodMatch || { isPreflight: true };

  var catalog = {
    id: EntryMatch['catalog-id'],
    name: EntryMatch['catalog-name'] };

  var organization = {
    id: EntryMatch['organization-id'],
    name: EntryMatch['organization-name'] };

  var product = {
    id: EntryMatch['product-id'],
    name: EntryMatch['product-name'] };

  var rateLimit;
  var rateLimits = EntryMatch['plan-rate-limit'];
  if (rateLimits) {
    for (var i = 0; i < rateLimits.length; i++) {
      if (Object.keys(rateLimits[i])[0] === 'x-ibm-unnamed-rate-limit') {
        rateLimit = rateLimits[i]['x-ibm-unnamed-rate-limit'];
        rateLimits.splice(i, 1);
        break;
      }
    }
  }

  var plan = {
    id: EntryMatch['plan-id'],
    name: EntryMatch['plan-name'],
    version: EntryMatch['plan-version'],
    'rate-limit': rateLimit };
  if (rateLimits && !_.isEmpty(rateLimits)) {
    plan['rate-limits'] = rateLimits;
  }

  var api = {
    //id: EntryMatch['api-id'],  // not public context var
    document: EntryMatch['api-document'],
    //path: PathMatch,  // not public context var
    name: EntryMatch['api-name'],
    version: EntryMatch['api-version'],
    properties: EntryMatch['api-properties'],
    type: EntryMatch['api-type'],
    state: EntryMatch['api-state'],
    //method: MethodMatch.method,  // not public context var
    //operationId: MethodMatch.operationId, // not public context var
    org: organization,
    operation: {
      id: MethodMatch.operationId,
      path: PathMatch } };

  var internalVariables = {
    id: EntryMatch['api-id'],
    assembly: EntryMatch['api-assembly'],
    consumes: MethodMatch.consumes,
    operation: (MethodMatch.method ? MethodMatch.method : '').toLowerCase(), // per swagger spec
    operationId: MethodMatch.operationId,
    parameters: MethodMatch.parameters,
    path: PathMatch,
    produces: MethodMatch.produces,
    responses: MethodMatch.responses,
    'subscription-id': EntryMatch['subscription-id'],
    'subscription-active': EntryMatch['subscription-active'],
    'subscription-app-state': EntryMatch['subscription-app-state'] };

  var client = {
    app: {
      id: EntryMatch['client-id'],
      name: EntryMatch['client-name'] },
    org: {
      id: EntryMatch['client-org-id'],
      name: EntryMatch['client-org-name'] } };

  var context = {
    _: internalVariables,
    snapshot: EntryMatch['snapshot-id'],
    catalog: catalog,
    env: {
      path: catalog.name },
    organization: organization,
    product: product,
    plan: plan,
    api: api,
    client: client,
    rateLimits: MethodMatch['observed-rate-limit'],
    rateLimitScope: MethodMatch['rate-limit-scope'],
    testAppEnabled: EntryMatch['test-app-enabled'],
    spaceIds: EntryMatch['space-ids'],
    isPreflight: MethodMatch.isPreflight };

  return context;
}

