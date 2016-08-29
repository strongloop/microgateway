This middleware checks and loads the latest APIs from the data store and save
them under the context object, so that the following middlewares can access the
APIs, Plans, or Subscribptions directly.

## API
```js
var express = require('express');
var apiLoader = require('./lib/api-loader');

var app = express();
app.use(apiLoader(options));

  ...
```

To be added...

### options
`options` is an JSON object. You can define the following properties to
customize this middleware's behavior.

To be added...

