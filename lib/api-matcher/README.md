To determine which API is being called by the request, the `api-matcher`
middlware checks for an exact match of HTTP method and request URI. If multiple
API matches are found, the most specific API match is used.  Specificity is
determined by ranking the matches by the number of path parameters (and possibly
their position). Path parameters are replaced by regex wildcards, and the more
wildcards a path has the higher its score is. The matching logic picks the
lowest possible score from matching paths.

The processing is based on information provided in the request URL:

    `<protocol>://<hostname>[:<port>]/<basepath>/<path>[?<clientid query param>=<client identifier>[&<client secret query param>=<client secret>]]`

where:

   - `<protocol>` is one of *http* or *https*.
   - `<hostname>` is either DNS resolvable hostname or IPv4 literal.
   - `<port>` is integer (1 - 65535) representing TCP port to listen on;
     defaults to 80 for http and 443 for https.
   - `<basepath>` is the base path as defined by the Swagger 2.0 definition of
     the API.
   - `<path>` is the operation as defined by Swagger 2.0 definition of the API
   - `<clientid query param>` is the name of the query parameter used to specify
     the client identifier of the application.
   - `<client identifier>` is the client identifier of the application; use of
     client identifier is completely optional: if not used, API is public; if
     used but not on the URL, must be specified in header as specified in
     Swagger 2.0 definition of the API.
   - `<client secret query param>` is the name of the query parameter used to
     specify the client secret for the application.
   - `<client secret>` is the client secret for the application; use of client
     secret is optional and should only be used w/ 'https' AND when client_id is
     specified: if used but not on the URL, must be specified in header as
     specified in Swagger 2.0 definition of the API.

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

