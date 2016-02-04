# preflow

The `preflow` middleware has 2 basic responsibilities.
- Add a an assembly (see `x-ibm-configuration`) to the context for the flow-engine to enforce.
- Populate any context variables that may be needed by the flow-engine, the policies it enforces, or subsequent middlewares.

To achieve these goals, the preflow must determine which API is being called by the request. The information used to determine an API match are the request URI, the HTTP Method, and the clientID (if available).

The algorithm to determine an API match can be described as follows:
 1. Check for an exact match (request matches URLPath + ClientID + Method)
 1. Check for ClientID + Method, but URLPath with missing default environment (e.g. missing "prod" in org/prod)
 1. Check for URLPath + Method but see if an API is available that does not require ClientID
 1. Check for URLPath with missing environment name + Method but see if an API is available that does not require ClientID

In all of these scenarios, if multiple API matches are found, the most specific API match is used. Specificity is determined by ranking the matches by the number of path parameters (and TBD possibly their position).
Boring implementation detail: Path parameters are replaced by regex wildcards, the more wildcards a path has the higher its score is. The matching logic picks the lowest possible score from matching paths.

Additional info:
In special cases (when the APIm "Test" utility is used) the logic described above may end up with more than one exact match for a given API invocation (for example: the path, method and clientID are and exact match for 2 APIs because one API has been deployed through a normal means, but another API has been deployed by the test tool). In this scenario the test tool must disambuguate the API that it intends to call by setting 2 HTTP headers (`x-ibm-plan-id` and `x-ibm-plan-version`). This information is used at run time to select the proper API for the request.

NOTE: This story will not cover a "retry" scenario where one of the steps matches in error (e.g. note that in this scenario, sb is optional) I'll try to provide an example of this later.
