// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var echo = require('./support/echo-server');
var apimServer = require('./support/mock-apim-server/apim-server');
var fs = require('fs');
// var dsCleanup = require('./support/utils').dsCleanup;
// var dsCleanupFile = require('./support/utils').dsCleanupFile;

var mg = require('../lib/microgw');
process.env.CONFIG_DIR = __dirname + '/definitions/performance';
process.env.CATALOG_DIR = __dirname + '/definitions/performance/v1/catalogs/564b48aae4b0869c782edc2b';


//TODO load template
var apis_template = fs.readFileSync(process.env.CONFIG_DIR + '/apis_template');
var apis_template_json = JSON.parse(apis_template);
var path_template = JSON.stringify(apis_template_json[0].document.paths['/path01']);
var paths_template_json = JSON.parse(path_template);
var products_template = fs.readFileSync(process.env.CONFIG_DIR + '/products_template');
var products_template_json = JSON.parse(products_template);

//TODO read config
var perf_config = JSON.parse(fs.readFileSync(process.env.CONFIG_DIR + '/perf_config'));
var apis_number = perf_config.apis;
var path_number = perf_config.paths;


//TODO looping to create multiple api/path
for (var i = 2; i <= apis_number; i++) {
  var apin = 'api' + ('000' + i).substr(-3);

  var apis_iter = JSON.parse(apis_template);
  apis_iter[0].document.info.title = apin;
  apis_iter[0].document.info['x-ibm-name'] = apin;
  apis_iter[0].document.basePath = '/' + apin + '_base';
  apis_iter[0].id = apin;

  // multiple path


  for (var j = 2; j <= path_number; j++) {
    var pathn = 'path' + ('000' + j).substr(-2);
    apis_iter[0].document.paths[pathn] = paths_template_json;
  }
  apis_template_json.push(apis_iter[0]);

  products_template_json[0].document.apis[apin] = { name: apin + ':1.0.0' };
  products_template_json[0].document.plans.gold.apis[apin] = {};

}


//TODO write "products" and "apis" file
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

//TODO start system resource monitor

process.env.CONFIG_DIR = __dirname + '/definitions/performance';
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

      //TODO inject traffic
      //TODO generate report


