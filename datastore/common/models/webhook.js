// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

//var app = require('../../server/server');
var app = require('../../server/server');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:models:datastore:webhook' });
var LoadModel = require('../../server/boot/load-model.js');


module.exports = function(Webhooks) {
  Webhooks.observe(
    'after save',
    function(ctx, next) {
      logger.debug('supports isNewInstance?', ctx.isNewInstance !== undefined);
      if (ctx.isNewInstance) {
        if (logger.debug()) {
          logger.debug('new webhook received: %s',
            JSON.stringify(ctx.instance, null, 4));
        }
        LoadModel.triggerReloadFromWebhook(app, ctx);
      }
      next();
    }
  );
};
