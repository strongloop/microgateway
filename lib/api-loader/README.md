This middleware checks and loads the latest APIs from the data store, so that
the subsequent middlewares can access the data models, including APIs, Plans,
Subscribptions and so on, directly.

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

