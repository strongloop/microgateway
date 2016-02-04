var express = require('express');

var context = require('./context');
var preflow = require('./preflow');
var assembly = require('./assembly');

var app = module.exports = express();

var ctx_config = {
  "request": {
    "contentTypeMaps": [
      { "application/json": [ "*/json", "+json", "*/javascript" ] },
      { "application/xml": [ "*/xml", "+xml" ] }
    ]
  },
  "message": {
    "bodyParser": [
      { "json": [ "json", "+json" ] },
      { "text": [ "text/*" ] },
      { "urlencoded": [ "*/x-www-form-urlencoded" ] }
    ],
    "bodyFilter": {
      "DELETE": "reject",
      "GET": "reject",
      "HEAD": "reject",
      "OPTIONS": "ignore"
    }
  },
  "system": {
    "datetimeFormat": "YYYY-MM-DDTHH:mm:ssZ",
    "timezoneFormat": "Z"
  }
};

app.use(context(ctx_config));
app.use(preflow({}));
app.use(assembly({}));

app.listen(5000, function () {
  console.log('Example app listening on port 5000!');
});
