var app = require('../../server/server');
var logger = require('../../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore:models:product'});
var OptimizedData = require('./optimizedData.js');

module.exports = function(Products) {

  Products.observe(
    'after save',
    function(ctx, next) {
      logger.debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        logger.debug('new product received: ',
            JSON.stringify(ctx.instance,null,4));
        OptimizedData.createProductOptimizedEntry(app, ctx);
      }
      next();
    }
  );
};
