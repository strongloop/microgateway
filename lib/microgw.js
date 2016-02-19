'use strict'

var express = require('express');
var context = require('./context');
var preflow = require('./preflow');
var postflow = require('./postflow');
var assembly = require('./assembly');
var cleanup = require('./cleanup');
var ds = require('../datastore');
var app = express();
var path    = require('path');
var ploader = require('./policy-loader');
var _       = require('lodash');
var fs      = require('fs');

//load policies
var policies = createPolicyLoader();

app.use(context(ctx_config));
app.use(preflow({}));
app.use(assembly({ policies : policies.getPolicies()}));
app.use(cleanup());
app.use(postflow());

let server;
exports.start = function(port) {
  return new Promise((resolve, reject) => {
    ds.start(process.env.NODE_ENV === 'production')
      .then(() => {
        console.log ('starting gateway ', port);
        server = app.listen(port, function() {
          console.log('micro-gateway listening on port %d', port);
          resolve();
        });
      }).catch((err) => {
        console.log('micro-gateway failed to start: ', err);
        reject(err);
      });
  });
};

exports.stop = function() {
  return new Promise((resolve, reject) => {
    ds.stop()
      .then(() => {
        server.close(() => {
          resolve();
        });
      })
      .catch(reject);
  });
};

exports.app = app;

if (require.main === module) {
  exports.start(5000).
    then(() => {
      console.log('micro-gateway listening on port 5000');
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
      {'text': ['text/*']},
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
        let cfgFile = path.resolve(process.env.CONFIG_DIR, 'policy-locations.json');
        try {
            var stat = fs.statSync(cfgFile);
            if (stat.isFile()) {
                let json = require(cfgFile);
                let locations = [];
                if (json.locations) {
                    json.locations.forEach( location => {
                        locations.push(path.resolve(process.env.CONFIG_DIR, location));
                    });
                }
                rev = ploader.create(locations);
            }
        } catch (e) {
            //no such file, go default
        }
    }
    if (_.isUndefined(rev)) {
        //default logic
        console.error('default');
        rev = ploader.create(path.resolve(__dirname, '..', 'policies'));
    }
    return rev;
}
