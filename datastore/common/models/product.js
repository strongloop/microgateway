var app = require('../../server/server');
var debug = require('debug')('strong-gateway:data-store');
var OptimizedData = require('./optimizedData.js');

module.exports = function(Products) {

  Products.observe(
    'after save',
    function(ctx, next) {
      debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        debug('new product received: ',
            JSON.stringify(ctx.instance,null,4));
        OptimizedData.createProductOptimizedEntry(app, ctx);
      }
      next();
    }
  );
};