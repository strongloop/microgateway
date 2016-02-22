//var app = require('../../server/server');
var debug = require('debug')('micro-gateway:data-store');


module.exports = function(KeyExchange) {

  KeyExchange.observe(
    'after save',
    function(ctx, next) {
      debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        debug('new keyExchange received: ',
            JSON.stringify(ctx.instance,null,4));
      }
      next();
    }
  );
};

