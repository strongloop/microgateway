// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:api-matcher' });

/*
 * The "api-matcher" middlware selects the possible API candidates with the
 * criteria of method, path, etc. Once done, the candidates will be saved under
 * the context object.
 */
module.exports = function createApiMatcherMiddleware(options) {
  logger.debug('api-matcher middleware options: ', options);
  options = options || {};

  return function(req, res, next) {
    //parse the incoming path first
    var parsedUrl = url.parse(req.url, true /* query string */);
    var segments = parsedUrl.pathname.split('/');
    var path = '';
    if (segments.length === 1) {
      path = '/';
    } else {
      for (var k = 1; k < segments.length; k++) {
        path += '/' + segments[k];
      }
    }

    //Prepare the path and method to be compared
    var current = {};
    current.method = req.method;
    current.path = path;

    logger.debug('api-matcher entry. Incoming request:', current);

    var candidates = req.ctx._apis;
    candidates = candidates.filter(function(r) { return r['test-app-cid-sec']; });

    var matches = [];
    var bestScore = Number.MAX_VALUE; //some arbitrary high number

    var i = 0;
    //for each API candidate
    _.forEach(candidates, function(entry) {
      i++;
      logger.debug('api-matcher candidate (%d/%d), API=%s',
          i, candidates.length, entry['api-name']);

      var j = 0;
      //for each operation inside an API
      _.forEach(entry['api-paths'], function(pathobj) {
        j++;
        //1. match by path
        logger.debug('api-matcher path: %s to %s (the %dth operation in "%s")',
            current.path, pathobj['path-regex'], j, entry['api-name']);
        var re = new RegExp(pathobj['path-regex']);
        if (!re.test(current.path)) {
          return;
        }

        //2. match by method
        var mm; //the matched method object of the given pathobj
        for (var k = 0; k < pathobj['path-methods'].length; k++) {
          var methodObj = pathobj['path-methods'][k];
          logger.debug('api-matcher method: %s to %s (the %dth operation in "%s")',
              current.method, methodObj.method, j, entry['api-name']);
          if (current.method === methodObj.method) {
            mm = methodObj;
            break;
          }
        }

        //2.1 if method is not matched, check if CORS is enabled and if it is a preflight request
        var isCorsEnabled = true; //default
        if (entry['api-document'] && entry['api-document']['x-ibm-configuration'] &&
                entry['api-document']['x-ibm-configuration'].cors) {
          isCorsEnabled = entry['api-document']['x-ibm-configuration'].cors.enabled;
        }

        //For a preflight request, there will be no "mm" (the matched methodObj)
        if (!mm && (current.method !== 'OPTIONS' || !isCorsEnabled)) {
          return;
        }

        //3. if the maching-score is the same or better, add it to candidate list
        if (pathobj['matching-score'] <= bestScore) {
          var candidate = {
            score: pathobj['matching-score'],
            entry: entry,
            pathobj: pathobj,
            mm: mm,
            allowMethods: '' };

          if (isCorsEnabled) {
            candidate.allowMethods =
                _.map(pathobj['path-methods'], function(pm) { return pm.method; }).join(',');
            if (candidate.allowMethods !== '' && candidate.allowMethods.indexOf('OPTIONS') === -1) {
              candidate.allowMethods += ',OPTIONS';
            }
          }

          //if maching-score is the best so far, clear the array and start over
          if (pathobj['matching-score'] < bestScore) {
            matches = [];
            bestScore = pathobj['matching-score'];
          }

          matches.push(candidate);
        }
      });
    }); //end of the iteration

    if (matches.length === 0) {
      logger.error('api-matcher failed to match to any API');

      //404: Not found
      req.ctx.set('error.status.code', 404);
      req.ctx._apis = [];
      return next({ name: 'PreFlowError', message: 'unable to process the request' });
    }

    logger.debug('api-matcher is done. %d candidates have been narrowed down to %d',
            candidates.length, matches.length);
    req.ctx._apis = matches;
    next();
  };
};

