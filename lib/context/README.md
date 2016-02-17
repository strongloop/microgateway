Create a context object, populate APIm context variables into the context,
and attach the context object to Express `req.ctx`.

## API
```js
var express = require('express');
var contextMiddlewareFactory = require('./lib/context');

var app = express();
app.use(contextMiddlewareFactory(options));
app.use(function(req, res) {
  var ctx = req.ctx;

  // add a new context variable
  ctx.set('foo', 'bar');

  // get context variable value
  res.json({
    'verb': ctx.get('request.verb'),
    'datetime': ctx.get('system.datetime'),
    'payload': ctx.get('message.body')
  });
});
```

The `ctx` object provides getter and setter functions to access context
variables. See https://github.ibm.com/apimesh/flow-engine for `ctx` API.

See https://github.ibm.com/apimesh/collab/blob/master/design/gateway/context.md
for avaiable APIm context variables.

### options
`options` is an operational JSON object. You can define the following properties
to customize this middleware's behavior.

#### request.contentTypeMaps
an array of content-type normalization rule objects.

See https://github.ibm.com/apimesh/collab/blob/master/design/gateway/context.md
for detailed usage.

```js
var options = {
  request: {
    contentTypeMaps: [
      { 'application/json': [ '*/json', '+json', '*/javascript' ] },
      { 'application/xml': [ '*/xml', '+xml'] }
    ]
  }
};

var app = express();
app.use(contextMiddlewareFactory(options));

```

#### request.bodyParser
an array describing which parser should be used for which content-type.
For content-type not defined in this option, the default parsing method is
`raw`, i.e. Buffer.

Currently, the underlying implementation uses parsers from 
`body-parser` https://github.com/expressjs/body-parser to parse payload.

See https://github.ibm.com/apimesh/collab/blob/master/design/gateway/context.md
for detailed usage.

```js
var options = {
  request: {
    bodyParser: [
      { json: [ '*/json', '*/+json' ] },  // JSON content-type using json parser
      { text: [ 'text/*'] },          // text content-type using text parser
      { urlencoded: [ '*/x-www-form-urlencoded'] }
    ];
  }
};

var app = express();
app.use(contextMiddlewareFactory(options));
```


#### request.bodyFilter
an object defines when to reject or ignore payload of specific HTTP methods.

See https://github.ibm.com/apimesh/collab/blob/master/design/gateway/context.md
for detailed usage.

```js
var options = {
  request: {
    bodyFilter: {
      DELETE: 'reject',
      GET: 'reject',
      HEAD: 'reject',
      OPTIONS: 'ignore'
    }
  }
};

var app = express();
app.use(contextMiddlewareFactory(options));
```


#### system.datetimeFormat
a string describing the format of `system.datetime` variable. The formatting is
done using `moment` module. 

See http://momentjs.com/docs/#/displaying/ for available formats.

```js
var options = {
  system: {
    datetimeFormat: 'YYYY-MM-DDTHH:mm:ssZ'
  }
};

var app = express();
app.use(contextMiddlewareFactory(options));
```


#### system.timezoneFormat
a string describing the format of `system.timezone` variable. The formatting is
done using `moment` module.

See http://momentjs.com/docs/#/displaying/ for available formats.

```js
var options = {
  system: {
    timezoneFormat: 'Z'
  }
};

var app = express();
app.use(contextMiddlewareFactory(options));
```


