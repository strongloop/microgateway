2018-03-07, Version 1.6.7
=========================

 * Check existence of the env.yaml file

2017-10-26, Version 1.6.6
=========================

 * Update shrinkwrap (Ryan Graham)

2017-10-26, Version 1.6.5
=========================

 * Update shrinkwrap (Gary Tu)

2017-10-12, Version 1.6.4
=========================

 * Add sub-type for the loopback model (Gary Tu)

2017-04-03, Version 1.6.3
=========================

 * Fix DBCS issue (#63) (Jeremy Geddes)


2016-12-13, Version 1.6.2
=========================

 * add shrinkwrap (Joseph Tary)


2016-12-06, Version 1.6.1
=========================

 * Ensure config/default dir is created (Daniel Badt)

 * Fix git url (Krishna Raman)

 * Add timeout to failing test. (Rick Curtis)

 * Update to use config/project modules. (Rick Curtis)


2016-10-13, Version 1.5.6
=========================

 * Fix writeFileSync calls (Daniel Badt)

 * File chg should not trigger timer (Daniel Badt)

 * Misc. fixes for webhooks (Daniel Badt)

 * Update the datastore/README.md (juangmj)


2016-10-11, Version 1.5.5
=========================

 * this is the current template for readme files (Om Goeckermann)

 * added new information - entries for default application and plan (Om Goeckermann)

 * fix timing issue of test case (Clement)

 * fix indetation problem on test data (Clement)

 * monitor local files for laptop experience (Clement)

 * Fix issue with webhooks unsubscribe (Daniel Badt)


2016-10-06, Version 1.5.4
=========================

 * Update README.md (Om Goeckermann)

 * Fix expected unsubscribe response code (Daniel Badt)

 * Add webhooks unsubscribe (Daniel Badt)

 * Address lint failures (Jon Palgon)

 * Some fixes for webhooks (Daniel Badt)

 * Initial changes for MGW webhooks (Daniel Badt)

 * Change space array names to plural (Daniel Badt)

 * uGW support for spaces (Daniel Badt)

 * Initialize the test-app-cid-sec to true (juangmj)

 * Allow test-app to call OAuth2 API (juangmj)

 * Check arbitrary apikeys before fixed (Daniel Badt)

 * Allow developers to configure plan and rate-limit (juangmj)

 * Should not reject GET requests with payload (juangmj)

 * Updates for the code review (juangmj)

 * Update testcase for node 0.12 (juangmj)

 * Reset limiter cache before the test begins (juangmj)

 * Refactor the preflow middleware (juangmj)

 * Remove the unused broken file (juangmj)

 * Use `fs-extra` instead of `fs.extra` (Jon Palgon)

 * Move config/default to test/definitions/default (Jon Palgon)

 * Remove unused dependencies (Jon Palgon)

 * Fix test case (Daniel Badt)

 * Make IF statement more efficient (Daniel Badt)

 * Allow swagger security ApiKeys to use arbitrary names (Daniel Badt)

 * Remove config dir if prev snapshot not loaded (Jon Palgon)

 * Skip token verification if oauth ctx exists (yihongwang)

 * Add test cases for oauth context vars (yihongwang)

 * Add OAuth context vars (yihongwang)

 * Only attempt to load prev snapshot if fail to load current (Jon Palgon)

 * Use real catalog instead of the one in product (Daniel Badt)

 * Remove CORS policy tests (Jon Palgon)

 * Remove unsupported CORS policy (Jon Palgon)

 * Use bluebird module for Promise (Jon Palgon)

 * Move to eslint 2.x (Krishna Raman)

 * Fix lint warning/error (Daniel Badt)

 * Fix quick-start when no subscription available (Daniel Badt)

 * Remove extraneous whitespace in subs (Thomas Burke)

 * Enable all tests (Thomas Burke)

 * Enable remaining tests, fix ctx breakage (Thomas Burke)

 * Enable one test case (Thomas Burke)

 * Fix tests (Thomas Burke)

 * Add check for active and state props (Thomas Burke)

 * Add logic to enforce active (Thomas Burke)

 * Make rate limit headers consistent w/edge (Daniel Badt)

 * remove un-used var in test script (Clement)

 * add UT test case (Clement)

 * use title if x-ibm-name is not available (Clement)

 * add error message (Clement)

 * Cleanup .datastore during `npm test` (Jon Palgon)

 * Cleanup env variable (Jon Palgon)

 * Use path module (Jon Palgon)

 * Add UT and required changes to support datastore restart (Jon Palgon)

 * Initial stab at loading previous directory on restart (Jon Palgon)

 * change default timeout to 300s (Clement)

 * Use the validated redirectURI (yihongwang)

 * testcases for oauth2 with cors (juangmj)

 * temporarily expect incorrect response (Jon Palgon)

 * Fix plan-level rate limiting (Daniel Badt)

 * Remove some temporary changes (Jon Palgon)

 * Fix rate limiting for multiple api matches (Daniel Badt)

 * Add missing test and temporarily force rate limit UT to pass (Jon Palgon)

 * Plan rate limiting UT w/ automatic subscription (Jon Palgon)

 * Add UT & fix for test app w/o credentials (Jon Palgon)

 * Fix test app names (Daniel Badt)

 * Initial set of quick start UT (Jon Palgon)

 * Fix operation rate-limit, make test-app visible (Daniel Badt)

 * Eliminate status 403 logic for testApp (Daniel Badt)

 * Initial changes to ugw for quick-start (Daniel Badt)

 * Check the params of the internal util function (yihongwang)

 * Added no-op defaultCallback to resource server (John Bellessa)

 * Fix eslint errors (yihongwang)

 * Add non-end2end test cases (yihongwang)

 * Add test case for bad custom consent form (yihongwang)

 * Support custom consent form in az-server (yihongwang)

 * Check for return from indexOf (Jon Palgon)

 * eslint failure (Jon Palgon)

 * Use common function for loading TLS config (Jon Palgon)

 * address apiconnect-cli-pm failure (Jon Palgon)

 * Correct jscs configuration file (Jon Palgon)

 * Resolve lint failures (Jon Palgon)

 * Enable Lint (Jon Palgon)

 * Fix no-proto, no-throw-literal, no-undef (juangmj)

 * fix eslint errors (juangmj)

 * eslint lib/ (juangmj)

 * eslint lib/preflow/ lib/urlrewrite/ (juangmj)

 * eslint datastore/ (juangmj)

 * eslint test/definitions/* test/support/* (juangmj)

 * eslint test/*.js (juangmj)

 * eslint index.js (juangmj)

 * eslint policies/ (juangmj)

 * eslint utils/ (juangmj)

 * change module name to 'microgateway' (Clement)

 * Skip the LDAP testcases for OAuth2 authentication (juangmj)

 * Add API docs for test cases (yihongwang)

 * Render login form again after failed login (yihongwang)

 * Add more hidden inputs for custom login form (yihongwang)

 * Handle socket error when retriving custom form (yhwang)

 * Update the default login/consent form template (yhwang)

 * Add api505,api506,api555,api556,api700,api710,api750 (juangmj)

 * Eliminate the warning from express-session (yihongwang)

 * Add logic for handling property ref within file (Jon Palgon)

 * Remove blank lines (Jon Palgon)


2016-07-25, Version 1.4.2
=========================



2016-07-20, Version 1.4.1
=========================



2016-07-19, Version 1.4.0
=========================

 * Updated shrinkwrap and travis files (Krishna Raman)

 * Fix flow-engine version spec (Krishna Raman)

 * Add .apiconnect/config file (Thomas Burke)

 * Remove .apiconnect file (Thomas Burke)

 * Remove node_modules from glob ignore (Thomas Burke)

 * microgateway: support password obfuscation (Behnam Hajian)

 * Update author and contributors (Jon Palgon)

 * remove glob from devDependency (Jon Palgon)

 * Increment flow-engine dependency (Jon Palgon)

 * Cleanup after analytics UT (Jon Palgon)

 * change return status code (Clement)

 * add the reason of validation failure (Clement)

 * use %j instead of %s (Clement)

 * remove tailing space and tab (Clement)

 * fix bug on target to be validated (Clement)

 * REST validate implementation (Clement)

 * Unescaped the values of a form in pug template (yihongwang)

 * Revert urlencode for intput values in a html form (yihongwang)

 * Re-enable policy-loader-runtime tests (Thomas Burke)

 * Fix jsdoc for function PolicyLoader (Thomas Burke)

 * Fix ratelimit and policy-version-runtime tests (Thomas Burke)

 * Temporarily skip new policy version tests (Thomas Burke)

 * remove extraneous change o policy-loadet.test.js (Thomas Burke)

 * restore projectDir test (Thomas Burke)

 * remove chdir from test (Thomas Burke)

 * observe  behavior (Thomas Burke)

 * fix swagger indentation for versions (Thomas Burke)

 * undo more unnecessary changes to policy-loader (Thomas Burke)

 * undo some unnecessary changes to policy-loader (Thomas Burke)

 * add tests for policy-loader version support (Thomas Burke)

 * add env var POLICY_DIR for testing (Thomas Burke)

 * fix test suite (Thomas Burke)

 * fix policy yamls, code cleanup (Thomas Burke)

 * first pass at policy loader enhancements (Thomas Burke)

 * Only enable analytics for valid API request (yihongwang)

 * Revise the payload of analytics event (yihongwang)

 * remove client_id from log msg (yihongwang)

 * use the new API for publishing analytics events. (yihongwang)

 * also check APIMANAGER_PORT before enabling analytics feature (yihongwang)

 * add client_id into the querystring and also validate client_id in moc server (yihongwang)

 * refine try/catch in descryptResponse() (yihongwang)

 * revise analytics moc server and user APIMANAGER_PORT instead of 9443 (yihongwang)

 * close https servers of invoke-server properly (yhwang)

 * use correct env:APIMANAGER and create a https moc server for x2020 (yhwang)

 * Use of ETag part 1 (Jon Palgon)


2016-07-18, Version 1.3.0
=========================

 * use lodash.isString() instead of (yhwang)

 * The values of inputs inside a html form need (yhwang)

 * Unl rate limit issue when combined with others (Daniel Badt)

 * Add logs to the refresh token testcase (juangmj)

 * Use public `loopback-connector-redis` package (Jon Palgon)

 * Correct installation instructions (Jon Palgon)

 * write error status code to ctx.error.status.code (yihongwang)

 * Fix existing UT that's failing (Jon Palgon)

 * fix test failure of resource server by changing the expected status code to 403 (yihongwang)

 * compromize with loopback-connector-redis limitation. The findById query may return an empty object (yihongwang)

 * - remove unecessary data model - compromise with the loopback-connector-redis   not using 'and' operator in where filter (yihongwang)

 * Handle invalid scopes as regressions expect (John Bellessa)

 * Added expected response error handling for OAuth2 resource server (John Bellessa)

 * Makes preflow filterAPIs() defer to error status codes that have already been set when no APIs have passed authentication (John Bellessa)

 * Updated how we handled invalid_token errors (John Bellessa)

 * refine the error to be an error object which contains 'error' for error code and 'message' for error message Then use error===401 to decide if a www-authenticate header is needed (yihongwang)

 * Check the appId of a resource request (juangmj)

 * Reject requests that use multiple authentication schemes (juangmj)

 * add registries for oauth regression also update ldap moc server accordingly (yihongwang)

 * Return invalid_token when access token is not found (juangmj)

 * Updated to handle missing tokens (John Bellessa)

 * Use InvalidTokenError() for cases when tokens cannot be decoded or parsed (John Bellessa)

 * Added InvalidTokenError() type and began using it for expired token errors (John Bellessa)

 * Handle expired tokens with appropriate response (John Bellessa)

 * Return the header WWW-Authenticate when authentication fails (juangmj)

 * Update the mock auth server (juangmj)

 * postpone the response_type check in AZ server after retriving client data, fails the request via redirect_uri if the response_type is invalid (yihongwang)

 * The scope of refresh token must be granted earlier (juangmj)

 * Added accessTokens.findById() (John Bellessa)

 * Make apiId available to resource server and include it in token search (#360) (John Bellessa)

 * Public clients may skip the authentication (juangmj)

 * change the error_code of invalid redirect_uri from 'invalid_client' to 'invalid_request' (yihongwang)

 * remove the next() call in postflow fix redis datasource setting bug when enabling redis as token store note: loopback-connector-redis only can access database 0 (yihongwang)

 * There are public and confidential clients (juangmj)

 * Allow HTTPS authentication without TLS profile (juangmj)

 * handle invalid requests from external AZ/AH redirect. also change the transaction param name from dp-state to rstate which is used by DataPower. (yihongwang)

 * Implement the deleteAZCode() (juangmj)

 * handle the external AZ/AH redirect url with url.parse and adding querystring properly (yihongwang)

 * Add the type 'oauth' (juangmj)

 * Correct the token parameters (juangmj)

 * id extractor still needs to know the login type is basic auth for login form (yihongwang)

 * - when login fails/error, write the error to   response body - invalid redirect_uri, write the error to   response body - modify test case according to the changes   above (yihongwang)

 * authentication error goes to response.body also fix api.id error in apis doc for testing (yihongwang)

 * In AZ server, when redirect uri is unavailable, directly write error code to response body (yhwang)

 * if there is no grant:accessCode|implicit and a request goes to az end point, an unauthorized_client error code is returned (yhwang)

 * Fix scope definitions (juangmj)

 * Fix the undefined redirect_uri (juangmj)

 * Updated APIs for microgateway (John Bellessa)

 * empty 'plan-registration'.apis equals 'all apis' (yhwang)

 * `subscriptions['plan-registration].apis` array (Jon Palgon)

 * use indexOf() instead of startWith() for 0.12 compatible (yhwang)

 * enhance the auth moc server to support multiple users (yihongwang)

 * Changed az-server authentication middleware to get client via models.clients.findById() (fix for #355) (John Bellessa)

 * Renamed resource server test file (John Bellessa)

 * Updated OAuth2 resource server tests (John Bellessa)

 * fix some missing properties in api doc (yihongwang)

 * - support to use redis for session-store and - add default value for TTL properties - add empty scope test case (yihongwang)

 * Add one more testcase (juangmj)

 * test cases for the disabled refresh token (juangmj)

 * add testcases for the grant_type 'authorization code' (juangmj)

 * Update testcases for the scope parameter (juangmj)

 * The scope parameter is required (juangmj)

 * Fix for apimesh/scrum-micro-gw#183: added reference to helpers.isExpired (John Bellessa)

 * add test cases for az-server - default login + default consent (yhwang)

 * Fix the regression in TLS configuration (juangmj)

 * Add more testcases for token endpoint (juangmj)

 * Fix the HTTPS basic authentication (juangmj)

 * Allow the HTTPS auth URL without TLS profile (juangmj)

 * Adding bad token test cases (John Bellessa)

 * Massage subs into format µGW accepts (Jon Palgon)

 * Skipping scope tests for now (John Bellessa)

 * Added support for scopes (John Bellessa)

 * Removed requires for missing/unnecessary packages and unused strategies (John Bellessa)

 * Updating OAuth2 resource tests (John Bellessa)

 * add az test cases - redirect - basic + default consent form (yihongwang)

 * Cleaned up OAuth2 resource server (John Bellessa)

 * Remove the unwanted files (juangmj)

 * Add testcases for refresh tokens (juangmj)

 * Add testcases for the grant type 'password' (juangmj)

 * add az test cases (yihongwang)

 * Added simple resource server test case using token from token endpoint (John Bellessa)

 * Fixed bug in how datasources get cached: cannot use object as property name because it always evaluates to [Object object] (John Bellessa)

 * Read authenticate-bind-admin-password for LDAP password (juangmj)

 * Use registry or auth url for basic authentication (juangmj)

 * Removed swagger-related code from OAuth (resource server) tests (John Bellessa)

 * Removed code held-over from preflow tests (John Bellessa)

 * Removed from oauth definitions (John Bellessa)

 * Added catalog007 (John Bellessa)

 * add test case for az server (yihongwang)

 * Add testcases for the grant type 'client_credential' (juangmj)

 * Return a 302 response for authorization error (juangmj)

 * Added path-to-regexp dependency to package.json (John Bellessa)

 * Update testcases (juangmj)

 * Add initial unit tests for the grant type 'password' (juangmj)

 * add redirect support (yihongwang)

 * Fix the previous commit. We use jwt id as the AZ code (juangmj)

 * For AZ code, the token is used as id (juangmj)

 * Initial unit tests for token endpoint (juangmj)

 * Adding and integrating additional files from loopback-component-oauth2 (John Bellessa)

 * support custom login form (yihongwang)

 * Delete the used refresh token (juangmj)

 * Revoke the refresn token and the AZ code if client provides wrong credential (juangmj)

 * Fix the undefined errors (juangmj)

 * The refresh token can be issued for only 'count' times (juangmj)

 * Fix the compile error (juangmj)

 * Update logs and error messages (juangmj)

 * Fixed bug caused by creating TokenError without required parameters. Other small tweaks (John Bellessa)

 * Added initial JWT access token validation middleware (John Bellessa)

 * Added sample token to test case (John Bellessa)

 * Added files for auth and on-prem testing (John Bellessa)

 * Added ability to convert Swagger YAMLs to JSON for on-prem testing (John Bellessa)

 * Updated reconstructed request properties (John Bellessa)

 * Added utils from loopback-component-oauth2 (John Bellessa)

 * Adding first OAuth2 resource server unit tests (John Bellessa)

 * Setting resource server as OAuth2 security handler (John Bellessa)

 * Wiring auth handler to push faux request through middleware (John Bellessa)

 * Added function to reconstruct relevant parts of the Express request object (John Bellessa)

 * Added resource-server/index.js (John Bellessa)

 * Added mac-token.js (John Bellessa)

 * Initial port of resource server from loopback-component-oauth2 (John Bellessa)

 * Moved generateJWTToken() to oauth2-helper.js (John Bellessa)

 * Validate the received refresh token (juangmj)

 * The jwt token should be returned in the access token. (juangmj)

 * Tidy the grant middlewares (juangmj)

 * Save refresh tokens in its own data model (juangmj)

 * fix rebase error (yihongwang)

 * 1. remove sub from JWT claim (yihongwang)

 * Rename function parameters (juangmj)

 * Tidy the files under lib/oauth2/az-server/exchange/ (juangmj)

 * Rename oauth-token.json to oauth-access-token.json (juangmj)

 * store the grant type into the token model (yihongwang)

 * modify the payload of the generated JWT (yihongwang)

 * when generate token/code, only authorize (yihongwang)

 * handle post request of default consent form (yihongwang)

 * Enable the grant type 'authorization_code' (juangmj)

 * Enable the grant type 'refresh_token' (juangmj)

 * add consent form middleware (yihongwang)

 * support default-form authentication (yihongwang)

 * Purge the expired code/token/permissions (juangmj)

 * Generate error resonse for OAuth2 error (juangmj)

 * Honor the token TTL in the OAuth2 configuraiton (juangmj)

 * The auth middleware should return the user object but not username (juangmj)

 * extract handler functions (yhwang)

 * fix undefined bug in default-form.js (yihongwang)

 * support default-form for login (yihongwang)

 * Support the token endpoint of OAuth2 (juangmj)

 * Rework the exchange of 'application' and 'password' for MicroGateway (juangmj)

 * Rework the token middleware for MicroGateway (juangmj)

 * Add client API to find by cliend id and api id (juangmj)

 * Minor changes to the basic auth codes (juangmj)

 * Refactor the basic auth code (juangmj)

 * [fix] use client["client-id"] property name instead of client.id to align with the data model (yihongwang)

 * load transaction from session correctly (yihongwang)

 * Refactor the basic auth codes (juangmj)

 * missing server param when calling validateClient() (yihongwang)

 * support implicit flow in az-server and add check methods in Server to verify grantType, responseType and scope (yihongwang)

 * modify "oauth2/models" module and get data model by datasource definition (yihongwang)

 * elimit the access of the http.Response object and use req.ctx.message instead (yihongwang)

 * write redirect to ctx instead of response (yihongwang)

 * limit the session enablement to only az path and implement the authorization.type === authenticated case (yihongwang)

 * support id-extration:basic (yihongwang)

 * get application info and call authorization middleware to verify the grant type and redirect-uri (yihongwang)

 * add az-server middleware into the microgateway app and start to process the az requests (yihongwang)

 * pull files from loopback-component-oauth2 (yihongwang)

 * add data models for oauth2 (yihongwang)

 * Change for rate-limits containing only unlimited (Daniel Badt)

 * Sort multi rate limits (Daniel Badt)

 * ratelimit:use async.series versus async.each (Thomas Burke)

 * Fix accepted rate limit units (Daniel Badt)

 * Support for unlimited ratelimits (Daniel Badt)

 * Move rate limit execution within preflow (Daniel Badt)

 * Code changes for multiple rate limits (Daniel Badt)

 * add support for enforced+state (Thomas Burke)

 * Bump version to 1.2.0 (Krishna Raman)

 * skip hanging ComposeUPN tests (Thomas Burke)

 * replace process.exit with logger.exit (Clement)

 * Use latest snapshot directory on refresh (Jon Palgon)

 * Account for `/` basePath and/or path (Jon Palgon)

 * modify copyright statements (Clement)

 * modify copyright statments (Clement)

 * add log for issue#154 (Clement)

 * correct test case expected response (Clement)

 * change regex to support {+...} (Clement)

 * add ut (Thomas Burke)

 * Add logic to disambiguate api in plan (Jon Palgon)


2016-05-24, Version 1.1.0
=========================

 * Increment package and dependency versions. (Rick Curtis)

 * Do not run ratelimit on auth failure (Daniel Badt)

 * Remove def listen port and change def APIm port (Jon Palgon)

 * Add the api.operation variables (juangmj)

 * Check that doc value is initialized (Daniel Badt)

 * Fix relative path resolution (Gary Tu)

 * Verify API Connect swagger security conventions (Daniel Badt)

 * Move bunyan from dependencies to devDependencies (Jon Palgon)

 * Fix redis based rate limiting (Raymond Feng)

 * freeze client,plan,env and system ctx variables (yihongwang)

 * Use plan.['rate-limit'] instead of plan.rateLimit (Jon Palgon)

 * Rename system.date.dayOf* properties to system.data.day-of-* for consistency (Jon Palgon)

 * Aggressive retry on startup (Jon Palgon)

 * Increment version for hot fix (Jon Palgon)

 * Suspend listening for traffic until APIs are specified (Jon Palgon)

 * Add test cases for no assembly (Daniel Badt)

 * Allow empty assemblies to loop back (Daniel Badt)

 * Restore gnarly logging statement (Daniel Badt)

 * Minor changes for the comments of code review (juangmj)

 * Fix for datastore when there are no IBM extensions (Daniel Badt)

 * Add RATELIMIT_REDIS env var to configure redis (Raymond Feng)

 * Add a warning if rate limit is exceeded but not rejected (Raymond Feng)


2016-05-05, Version 1.0.5
=========================

 * Fix testcase for node v4.3 (juangmj)

 * Fix testcase for node v0.12 (juangmj)

 * Replace continue-on-error with stop-on-error for invoke policy (juangmj)

 * avoid to print out sensitive messages in logger. also fix some eslint warnings/errors (yihongwang)

 * Add RATELIMIT_REDIS env var to configure redis (Raymond Feng)

 * Add a warning if rate limit is exceeded but not rejected (Raymond Feng)

 * the invoke policy to inject the default user agent (juangmj)

 * Return 401 when payload is not expected content-type (librah)

 * Change the reason phrase for the invoke policy (juangmj)

 * invoke policy to support continue-on-error (juangmj)

 * Add vendor extensions UT cases (librah)

 * Fix linting error (librah)

 * remove alternate path search that always fails (Thomas Burke)

 * add debug messages (Thomas Burke)

 * ut for #134 (Thomas Burke)

 * add optional terminating / match (Thomas Burke)

 * Invoke to use the default cipher "HIGH:MEDIUM:!aNULL:!eNULL:!RC4:@STRENGTH" (juangmj)

 * Fix invalid json syntax (juangmj)

 * Add ciphers SSL_RSA_WITH_AES_256_CBC_SHA and SSL_RSA_WITH_AES_128_CBC_SHA (juangmj)

 * Rename apiconnect-microgateway to microgateway (Raymond Feng)

 * Cleanup snapshot directories properly (Jon Palgon)

 * Fix API swagger properties parsing error (librah)


2016-04-08, Version 1.0.3
=========================

 * merge w/master (Daniel Badt)

 * Stop data store when uGW fails to start (Jon Palgon)

 * Fix UT data problem (Daniel Badt)

 * http/s port test cases (Daniel Badt)

 * Initial UT (Jon Palgon)

 * Final set of changes to get existing UT to pass (Jon Palgon)

 * Resolve context UT failures w/ HTTPS (Jon Palgon)

 * Fix a lot of UT failures by explicitly using HTTP scheme (Jon Palgon)

 * even more changes for http/s port (Daniel Badt)

 * more changes for http/s port (Daniel Badt)

 * create common function (Daniel Badt)

 * initial changes for http/https enforcement (Daniel Badt)

 * Added unit tests (John Bellessa)

 * Add UT for unsupported protocol (Jon Palgon)

 * Only break out of protocol loop if expected protocol (Jon Palgon)

 * formatting (Jon Palgon)

 * Address UT failures (Jon Palgon)

 * Default to not needing TLS profile (Jon Palgon)

 * default to options.rejectUnauthorized = false; if no CA specified or mutual-auth (Jeremy Geddes)

 * Correctly set the cert and ca properties (Jon Palgon)

 * Use all 'public' certs for the CA (Jon Palgon)

 * Datastore cleanup + logging (Jon Palgon)

 * Updates based on code review (Jon Palgon)

 * Updates based on discussion with @palgon (John Bellessa)

 * Changed to using YAML for environment variables instead of JSON (John Bellessa)

 * Added logic load environment variables from env.json (John Bellessa)

 * Don't start the gateway w/ mixed protocols (Jon Palgon)

 * fix path (Jeremy Geddes)

 * only set if undefined (Jeremy Geddes)

 * remove console.log (Jeremy Geddes)

 * add default onprem prof json.. fix typo.. make production default (Jeremy Geddes)

 * Set request.uri to the original request URL (librah)

 * Replace debug will logger.debug (Raymond Feng)

 * TLS server config support for referring to property in json file (Jon Palgon)

 * Removed logger calls that contained credential passwords. See #112 (John Bellessa)

 * UT for empty basepath and root path (Jon Palgon)

 * don't suggest CONFIG_DIR should be used in laptop (Jeremy R. Geddes)

 * typo (Jeremy R. Geddes)

 * Updated logging for basic auth (John Bellessa)

 * Have child listen for disconnect instead of parent listening for SIGTERM (Jon Palgon)

 * Implementing simple optimizedData response cache. See #45 and #189 for details. (John C. Bellessa)


2016-03-21, Version 1.0.2
=========================



2016-03-21, Version 1.0.1
=========================

 * First release!
