The middleware `security-check` filters out the API candidates whose security
requirements are not fulfilled. Hopefully, the candidate list would be narrowed
down to 1. If not, there will be further precedence checks to pick up the final
one.

## API
```js
var express = require('express');
var securityCheck = require('./lib/security-check');

var app = new express();
app.use(securityCheck(options));

  ...
```

To be added...

### options
`options` is an JSON object. You can define the following properties to
customize this middleware's behavior.

To be added...

