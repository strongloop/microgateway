In the `security-check` middlware, the information used to determine an API
match are the client Id/Secret, HTTP authorization header, or oauth2 access
token. These credentials are validated in accordance with the swagger security
requirements of individual API definitions.

The client Id and secret are provided in the request URL:

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

Additional info:
In special cases (when the APIm "Test" utility is used) the logic described
above may end up with more than one exact match for a given API invocation (for
example: the path, method and clientID/secret are and exact match for 2 APIs
because one API has been deployed through a normal means, but another API has
been deployed by the test tool). In this scenario the test tool must
disambuguate the API that it intends to call by setting 2 HTTP headers
(`x-ibm-plan-id` and `x-ibm-plan-version`). This information is used at run
time to select the proper API for the request.

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

