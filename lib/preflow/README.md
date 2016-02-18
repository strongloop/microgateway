# preflow

The `preflow` middleware has 2 basic responsibilities.

- Add a an assembly (see `x-ibm-configuration`) to the context for the flow-engine to enforce.
- Populate any context variables that may be needed by the flow-engine, the policies it enforces, or subsequent middlewares.

To achieve these goals, the preflow must determine which API is being called by the request. The information used to determine an API match are the request URI, the HTTP Method, and the clientID (if available).

The algorithm to determine an API match can be described as follows, based on the URL of the request (see below):

1. Check for an exact match (request matches URLPath + ClientID/Secret + Method)
1. Check for ClientID/Secret + Method, but URLPath with missing default environment (e.g. missing "prod" in org/prod)

Note that ClientID/Secret values are validated in accordance with the swagger security requirements of individual API definitions.

In all of these scenarios, if multiple API matches are found, the most specific API match is used. Specificity is determined by ranking the matches by the number of path parameters (and TBD possibly their position).
Path parameters are replaced by regex wildcards, and the more wildcards a path has the higher its score is. The matching logic picks the lowest possible score from matching paths.

Additional info:
In special cases (when the APIm "Test" utility is used) the logic described above may end up with more than one exact match for a given API invocation (for example: the path, method and clientID/secret are and exact match for 2 APIs because one API has been deployed through a normal means, but another API has been deployed by the test tool). In this scenario the test tool must disambuguate the API that it intends to call by setting 2 HTTP headers (`x-ibm-plan-id` and `x-ibm-plan-version`). This information is used at run time to select the proper API for the request.


Preflow processing is based on information provided in the request URL:

    `<protocol>://<hostname>[:<port>]/<provider organization>[/<catalog>][/<basepath>]/<path>[?<clientid query param>=<client identifier>[&<client secret query param>=<client secret>]]`

where:

   - `<protocol>` is one of *http* or *https*
   - `<hostname>` is either DNS resolvable hostname or IPv4 literal
   - `<port>` is integer (1 - 65535) representing TCP port to listen on; defaults to 80 for http and 443 for https
   - `<provider organization>` is the provider organization  (This field is TBD)
   - `<catalog>` is the environment; when not provided use the default catalog
   - `<basepath>` is the base path as defined by the Swagger 2.0 definition of the API
   - `<path>` is the operation as defined by the Swagger 2.0 definition of the API
   - `<clientid query param>` is the name of the query parameter used to specify the client identifier of the application (in actuality, this query parameter name is fixed for APIm to be *client_id*)
   - `<client identifier>` is the client identifier of the application; use of client identifier is completely optional: if not used, API is public; if used but not on the URL, must be specified in header as specified in Swagger 2.0 definition of the API (in actuality, the header name is fixed for APIm to be *X-IBM-Client-Id*)
   - `<client secret query param>` is the name of the query parameter used to specify the client secret for the application (in actuality, this query parameter name is fixed for APIm to be *client_secret*)
   - `<client secret>` is the client secret for the application; use of client secret is optional and should only be used w/ 'https' AND when client_id is specified: if used but not on the URL, must be specified in header as specified in Swagger 2.0 definition of the API  (in actuality, the header name is fixed for APIm to be *X-IBM-Client-Secret*)

