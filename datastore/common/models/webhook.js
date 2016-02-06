//var app = require('../../server/server');
var debug = require('debug')('strong-gateway:data-store');


module.exports = function(Webhooks) {

  Webhooks.observe(
    'after save',
    function(ctx, next) {
      debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        debug('new webhook received: ',
            JSON.stringify(ctx.instance,null,4));
      }
      next();
    }
  );
};

