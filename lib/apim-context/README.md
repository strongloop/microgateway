Create the APIM related context variables to be accessed in the following
middlewares and assembly. The responsibility of the `apim-context` middleware is
to populate any context variables that may be needed by the flow-engine, the
policies it enforces, or subsequent middlewares.

## API
```js
var express = require('express');
var apimCtx = require('./lib/apim-context');

var app = express();
app.use(apimCtx(options));

  ...
```

To be added...

### options
`options` is an JSON object. You can define the following properties to
customize this middleware's behavior.

To be added...

