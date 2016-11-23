// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var Promise = require('bluebird');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:apic-plan' });

/*
 * Determine matched API
 */
module.exports = function createApimContextMiddleware(options) {
  logger.debug('apic-plan middleware options: ', options);
  options = options || {};

  return function(req, res, next) {
    var ctx = req.ctx;
    var champion = ctx._apis[0];
    if (ctx._apis.length > 1) {
      var planId = req.headers['x-ibm-plan-id'];
      if (planId) {
        logger.debug('apic-plan: check the planId=', planId);
        for (var i = 0; i < ctx._apis.length; i++) {
          if (ctx._apis[i].subscription['plan-registration'].plan.id === planId) {
            champion = ctx._apis[i];
            break;
          }
        }
      }
    }

    if (champion) {
      if (champion.noSecurityReqs === false &&
          (!champion.subscription.active || champion.subscription.application.state !== 'ACTIVE')) {
        logger.error("apic-plan: the app's subscription is not active.");

        //401: Unauthorized (for inactive client)
        req.ctx.set('error.status.code', 401);
        return next({ name: 'PreFlowError', message: 'Subscription is not active.' });
      } else if (champion.doc.state === 'suspended') {
        logger.error('apic-plan: API is currently suspended.');

        //503: Service unavailable
        req.ctx.set('error.status.code', 503);
        return next({ name: 'PreFlowError', message: 'API is suspended now.' });
      } else {
        req.ctx._api = champion;
        return next();
      }
    } else {
      logger.error('apic-plan failed to match to any API');

      var status = req.ctx.get('error.status.code');
      if (!status || status < 400) {
        //401: Unauthorized (for all security checks failed)
        req.ctx.set('error.status.code', 401);
      }
      return next({ name: 'PreFlowError', message: 'unable to process the request' });
    }
  };
}
