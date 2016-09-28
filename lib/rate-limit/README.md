Read the rate-limit setting from the plan and apply it to the current client's
API request.

## API
```js
var express = require('express');
var rateLimit = require('./lib/rate-limit');

var app = new express();
app.use(rateLimit(options));

  ...
```

To be added...

### options
`options` is an JSON object. You can define the following properties to
customize this middleware's behavior.

To be added...

