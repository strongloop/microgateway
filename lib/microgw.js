'use strict'

var Promise = require('bluebird');
var express = require('express');
var urlrewrite = require('./urlrewrite');
var context = require('./context');
var preflow = require('./preflow');
var postflow = require('./postflow');
var assembly = require('./assembly');
var cleanup = require('./cleanup');
var ds = require('../datastore');
var path = require('path');
var ploader = require('./policy-loader');
var _       = require('lodash');
var fs      = require('fs');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:microgw'});
var errhandler = require('./error-handler');
var analytics = require('./analytics');

//load policies
//if there is projectDir, pass it as one of the option
var policies = ploader.createMGLoader({'override':false});

var app = express();
app.use(urlrewrite());
app.use(context(ctx_config));
app.use(analytics({}));
app.use(preflow({}));
app.use(assembly({policies : policies.getPolicies()}));
app.use(cleanup());
app.use(postflow());
app.use(errhandler());

var server;
exports.start = function(port) {
  return new Promise(function(resolve, reject) {
    ds.start(process.env.NODE_ENV === 'production')
      .then(function() {
        logger.debug ('starting gateway ', port);
        server = app.listen(port, function() {
          logger.debug('micro-gateway listening on port %d', port);
          resolve();
        });
      }).catch(function(err) {
        logger.debug('micro-gateway failed to start: ', err);
        reject(err);
      });
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    ds.stop()
      .then(function() {
        server.close(function() {
          resolve();
        });
      })
      .catch(reject);
  });
};

exports.app = app;

if (require.main === module) {
  exports.start(5000).
    then(function() {
      logger.debug('micro-gateway listening on port 5000');
    });
}

var ctx_config = {
  'request': {
    'contentTypeMaps': [
      {'application/json': ['*/json', '+json', '*/javascript']},
      {'application/xml': ['*/xml', '+xml']}
    ],
    'bodyParser': [
      {'json': ['json', '+json']},
      {'text': ['text/*', '*/xml', '+xml']},  // XML parser not available
      {'urlencoded': ['*/x-www-form-urlencoded']}
    ],
    'bodyFilter': {
      'DELETE': 'reject',
      'GET': 'reject',
      'HEAD': 'reject',
      'OPTIONS': 'ignore'
    }
  },
  'message': {
  },
  'system': {
    'datetimeFormat': 'YYYY-MM-DDTHH:mm:ssZ',
    'timezoneFormat': 'Z'
  }
};

function createPolicyLoader() {
    //check if CONFIG_DIR exists
    var rev;
    if (process.env.CONFIG_DIR) {
        var cfgFile = path.resolve(process.env.CONFIG_DIR, 'policy-locations.json');
        try {
            var stat = fs.statSync(cfgFile);
            if (stat.isFile()) {
                var json = require(cfgFile);
                var locations = [];
                if (json.locations) {
                    json.locations.forEach(function(location) {
                        locations.push(path.resolve(process.env.CONFIG_DIR, location));
                    });
                }
                rev = ploader.create(locations, json.config);
            }
        } catch (e) {
            //no such file, go default
        }
    }
    if (_.isUndefined(rev)) {
        //default logic
        logger.error('default');
        rev = ploader.create(path.resolve(__dirname, '..', 'policies'));
    }
    return rev;
}
>>>>>>> update the files under lib/preflow/ for downgrade to node 0.10.x
