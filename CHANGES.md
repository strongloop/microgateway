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

 * Updated logging for basic auth (John Bellessa)

 * Have child listen for disconnect instead of parent listening for SIGTERM (Jon Palgon)

 * Implementing simple optimizedData response cache. See #45 and #189 for details. (John C. Bellessa)


2016-03-22, Version show
========================

 * don't suggest CONFIG_DIR should be used in laptop (Jeremy R. Geddes)

 * typo (Jeremy R. Geddes)


2016-03-21, Version 1.0.2
=========================



2016-03-21, Version 1.0.1
=========================

 * First release!
