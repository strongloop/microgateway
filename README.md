# micro-gw

[![Build Status](https://apim-jenkins3.hursley.ibm.com/buildStatus/icon?job=micro-gw)](https://apim-jenkins3.hursley.ibm.com/view/API%20Connect/job/micro-gw/)

API Mesh MicroGateway

This in an attempt to cleanup the strong-gateway codebase. To
only include the code and test cases relevant to Q1 policy content.

We can migrate the outstanding work that will be merging from feature
branches into strong-gateway here, or the reverse direction. Whatever
works for folks.

Ultimately either this repo or strong-gateway repo will disappear.

#### Run
```
node .
```
or
```
npm test
```
#### Notes
I’ve updated the datastore so it can run in the same process for testing/non-production purposes. 

export NODE_ENV=production  to enable the parent-child process configuration

Here is an example using node-inspector to test with mocha
```
node-debug ./node_modules/.bin/_mocha -t 99999999 test/assembly.test.js
```
