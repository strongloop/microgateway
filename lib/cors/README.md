Prepare the CORS headers, and process the preflight requests.

## API
```js
var express = require('express');
var cors = require('./lib/cors');

var app = express();
app.use(cors(options));
app.use(function(req, res) {
   //...
});

```

To be added...

### options
`options` is an JSON object. You can define the following properties to
customize this middleware's behavior.

To be added...

