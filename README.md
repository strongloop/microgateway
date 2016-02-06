# micro-gw
API Mesh MicroGateway

This in an attempt to cleanup the strong-gateway codebase. To
only include the code and test cases relevant to Q1 policy content.

We can migrate the outstanding work that will be merging from feature
branches into strong-gateway here, or the reverse direction. Whatever
works for folks.

Ultimately either this repo or strong-gateway repo will disappear.

#### Run

Haven't cloned over the data-store, so you need to run this:
```
cd strong-gateway; node data-store/server/server.js
npm test
```
