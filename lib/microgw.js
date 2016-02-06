var express = require('express');
var context = require('./context');
var preflow = require('./preflow');
var assembly = require('./assembly');
var ds = require('../datastore');
var debug = process.env.NODE_ENV !== 'production';
var app = express();

app.use(context(ctx_config));
app.use(preflow({}));
app.use(assembly({}));

exports.start = function(port, cb) {
  ds.start(!debug, function(data) {
    app.listen(port, function() {
      console.log('MicroGateway listening on port %d!', port);
      if (cb) cb();
    });
  });
};

var ctx_config = {
  'request': {
    'contentTypeMaps': [
      {'application/json': ['*/json', '+json', '*/javascript']},
      {'application/xml': ['*/xml', '+xml']}
    ]
  },
  'message': {
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
  'system': {
    'datetimeFormat': 'YYYY-MM-DDTHH:mm:ssZ',
    'timezoneFormat': 'Z'
  }
};

