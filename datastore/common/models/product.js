// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

var app = require('../../server/server');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:models:product' });
var OptimizedData = require('./optimizedData.js');

module.exports = function(Products) {

  Products.observe(
    'after save',
    function(ctx, next) {
      logger.debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        if (logger.debug()) {
          logger.debug('new product received: %s',
            JSON.stringify(ctx.instance, null, 4));
        }
        OptimizedData.createProductOptimizedEntry(app, ctx);
      }
      next();
    }
  );
};
