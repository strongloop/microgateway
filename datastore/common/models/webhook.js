//var app = require('../../server/server');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:models:datastore:webhook'});


module.exports = function(Webhooks) {

  Webhooks.observe(
    'after save',
    function(ctx, next) {
      logger.debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        logger.debug('new webhook received: ',
            JSON.stringify(ctx.instance,null,4));
      }
      next();
    }
  );
};

