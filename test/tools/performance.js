// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var echo = require('../support/echo-server');
var apimServer = require('../support/mock-apim-server/apim-server');
var fs = require('fs');
var mg = require('../../lib/microgw');
process.env.CONFIG_DIR = __dirname + '/../definitions/performance';
process.env.CATALOG_DIR = __dirname + '/../definitions/performance/v1/catalogs/5714b14ce4b0e6c6f7d287eb';

// load template
var apis_template = fs.readFileSync(process.env.CONFIG_DIR + '/apis_template');
var apis_template_json = JSON.parse(apis_template);
var path_template = JSON.stringify(apis_template_json[0].document.paths['/path_template']);
var paths_template_json = JSON.parse(path_template);
var products_template = fs.readFileSync(process.env.CONFIG_DIR + '/products_template');
var products_template_json = JSON.parse(products_template);
var subscriptions_template = fs.readFileSync(process.env.CONFIG_DIR + '/subscriptions_template');
var subscriptions_template_json = JSON.parse(subscriptions_template);

// read config
var perf_config = JSON.parse(fs.readFileSync(process.env.CONFIG_DIR + '/perf_config'));
var apis_number = perf_config.apis;
var path_number = perf_config.paths;
var security_enable = perf_config.security;
var ratelimit_enable = perf_config.ratelimit;
var subscription_number = perf_config.subscription;
var credentials_number = perf_config.credentials;

// remove the template apis
apis_template_json.pop();

// looping to create multiple api/path
for (var i = 1; i <= apis_number; i++) {
  var apin = 'api' + ('000' + i).substr(-3);

  var apis_iter = JSON.parse(apis_template);
  apis_iter[0].document.info.title = apin;
  apis_iter[0].document.info['x-ibm-name'] = apin;
  apis_iter[0].document.basePath = '/' + apin + '_base';
  apis_iter[0].id = apin;

// multiple path

// remove the template path
  delete apis_iter[0].document.paths['/path_template'];

// removing security setting
  if (!security_enable) {
    delete apis_iter[0].document['securityDefinitions'];
    delete apis_iter[0].document['security'];
    delete paths_template_json.get['security'];
    delete paths_template_json.post['security'];
  }

  for (var j = 1; j <= path_number; j++) {
    var pathn = '/path' + ('000' + j).substr(-2);
    apis_iter[0].document.paths[pathn] = paths_template_json;
  }

  apis_template_json.push(apis_iter[0]);

  products_template_json[0].document.apis[apin] = { name: apin + ':1.0.0' };

// add api to ratelimit plan
  if (!ratelimit_enable) {
    delete products_template_json[0].document.plans.default['rate-limits'];
  }
}

// subscriptions is necessary for security in our testing scenario
if (security_enable) {
  subscriptions_template_json[0]['plan-registration'].apis = apis_template_json;
  subscriptions_template_json[0]['plan-registration'].product = products_template_json[0];
  delete subscriptions_template_json[0]['plan-registration'].product['url'];
} else {
  subscriptions_template_json = [];
}

// write "products", "apis" and "subscriptions" file
fs.writeFile(process.env.CATALOG_DIR + '/apis', JSON.stringify(apis_template_json, null, 2), function(err) {
  if (err) {
    return console.log(err);
  }
});

fs.writeFile(process.env.CATALOG_DIR + '/products', JSON.stringify(products_template_json, null, 2), function(err) {
  if (err) {
    return console.log(err);
  }
});

// remove orgnization and catalog in "product" section
if (security_enable) {
  delete subscriptions_template_json[0]['plan-registration'].product.organization;
  delete subscriptions_template_json[0]['plan-registration'].product.catalog;
}

// multiple subscriptions
if (subscription_number >= 1) {
  for (var k = 1; k <= subscription_number; k++) {
    var subn = 'sub' + ('00' + k).substr(-2);

    var subscriptions_iter = JSON.parse(JSON.stringify(subscriptions_template_json[0]));
    subscriptions_iter.id = subn;
    subscriptions_iter.application.id = subn + '_application_id';

    for (var n = 1; n <= credentials_number; n++) {
      var credential_iter = JSON.parse(JSON.stringify(subscriptions_iter.application['app-credentials'][0]));
      credential_iter.id = subn + '_app-credentials_' + n;
      credential_iter['client-id'] = subn + '_client-id_' + n;
      credential_iter['client-secret'] = subn + '_client-secret_' + n;
      subscriptions_iter.application['app-credentials'].push(credential_iter);
    }
    // remove the credential from template
    subscriptions_iter.application['app-credentials'].shift();
    subscriptions_template_json.push(subscriptions_iter);
  }
  // remove the subcription from template
  delete subscriptions_template_json.shift();
}
fs.writeFile(process.env.CATALOG_DIR + '/subscriptions', JSON.stringify(subscriptions_template_json, null, 2),
  function(err) {
    if (err) {
      return console.log(err);
    }
  });

// start system resource monitor
process.env.CONFIG_DIR = __dirname + '/../definitions/performance';
process.env.NODE_ENV = 'production';
process.env.APIMANAGER = '127.0.0.1';
process.env.APIMANAGER_PORT = 8081;
process.env.DATASTORE_PORT = 5000;
apimServer.start(
  process.env.APIMANAGER,
  process.env.APIMANAGER_PORT,
  process.env.CONFIG_DIR)
  .then(function() {
    return mg.start(3000);
  })
  .then(function() {
    return echo.start(8889);
  })
  .catch(function(err) {
    console.error(err);
  });
      // TODO inject traffic
      // TODO generate report
