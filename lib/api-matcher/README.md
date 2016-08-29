The middleware `api-matcher` filters out the unqualified APIs by `method`,
`path`, and `parameter`. The remaining candiates of { client, plan, api }
objects are saved in the array object `context._candidates`.

## API
```js
var express = require('express');
var apiMatcher = require('./lib/api-matcher');

var app = new express();
app.use(apiMatcher(options));

  ...
```

To be added...

### options
`options` is a JSON object. You can define the following properties to customize
this middleware's behavior.

To be added...

