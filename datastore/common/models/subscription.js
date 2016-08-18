// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var app = require('../../server/server');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:models:subscription' });
var OptimizedData = require('./optimizedData.js');

module.exports = function(Subscriptions) {

  Subscriptions.observe(
    'after save',
    function(ctx, next) {
      logger.debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        if (logger.debug()) {
          logger.debug('new subscription received: %s',
            JSON.stringify(ctx.instance, null, 4));
        }
        OptimizedData.determineNeededSubscriptionOptimizedEntries(app, ctx);
      }
      next();
    }
  );
};

