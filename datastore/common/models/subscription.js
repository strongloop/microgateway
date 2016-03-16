var app = require('../../server/server');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore:models:subscription'});
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

