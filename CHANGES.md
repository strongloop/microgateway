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
