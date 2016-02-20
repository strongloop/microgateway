# APIm Optimized datastore builder

## Environment Variables

- APIMANAGER : Host of the APIm when you need to connect to. (online only)
- APIMANAGER_PORT : Port to connect to APIm on. (online only)
- DATASTORE_PORT : 
  By default, the datastore binds to port 0, causing an ephemeral port listen
  If set before startup, the datastore will listen on that port
- CONFIGDIR : 
  Directory of swagger to load. (online & laptop, this will be used for initial load. online will load into ./config for subsequent loads)
  
## What does it do?
Currently, it periodically uses apim-pull.js to download files from APIm, uses these locally persisted files to populate the data models with them, and builds another model which is optimized for preflow lookup.

## How do I use it manually?

1. Using the apim-export cli, put the data wherever you want (this example uses ./config/default).. then specify this directory as the CONFIG_DIR environment variable for the gateway..
  - How to run it:

    ```
    From strong-gateway root:
    apim-export -o ./config/default sjsldev249.dev.ciondemand.com (or whatever server you want to pull the data from)
    ```
1. Introspect the models using the explorer: http://hostname:<ephemeralport>/explorer/
1. Test the lookup using the apim-getcontext cli (outputs contents that would be returned to the preflow)
  - examples:
    ```

    apim-getcontext -p /apim/sb/v1/ascents   -c fb82cb59-ba95-4c34-8612-e63697d7b845 -m GET
    apim-getcontext -p /apim/sb/v1/ascents   -c 612caa59-9649-491f-99b7-d9a941c4bd2e -m GET
    apim-getcontext -p /apim/sb/v1/forecasts -c 612caa59-9649-491f-99b7-d9a941c4bd2e -m GET
    ```


# apim-pull.js
APIm Pull is a module intended to be used by the [Micro Gateway](https://github.ibm.com/apimesh/strong-gateway) with [IBM API Management](http://www-03.ibm.com/software/products/en/api-management) as part of the IBM API Connect portofolio.  The purpose of the module is to pull the configuration from the API management server and persist the configuration locally for later consumption by the gateway's data-store component.

## What is working?
The module queries the remote APIm server for the catalogs and persists the JSON response in a specified directory.  For each catalog, the module queries the remote APIm server for the APIs, products, and subscriptions and persists the JSON responses.  Each Swagger document in the list of APIs is then broken out into a separate YAML file.  Finally, the module responds to the caller with an object containing the file names and the corresponding sections they belong to.
The files are named as follows:
- Catalogs: `<outdir>/catalogs-<base64 etag>.json`
- APIs:
    - `<outdir>/apis-<org id>-<catalog id>-<base64 etag>.json`
    - `<outdir>/api-<org id>-<catalog id>-<apiname>-<apiver>-<base64 etag>.yml`
- Products: `<outdir>/products-<org id>-<catalog id>-<base64 etag>.json`
- Subscriptions: `<outdir>/subs-<org id>-<catalog id>-<base64 etag>.json`

## How was this tested?
Using IBM API Management server from IBM API Connect v5 nightly build AND using [http-server](https://github.com/indexzero/http-server) configured as an HTTPS server statically hosting the JSON files Jon had uploaded to [collab/api-metadata-samples](https://github.ibm.com/apimesh/collab/tree/master/apim-metadata/samples), and the [test/index.js](./test/index.js)
```
jons-mbp:http-server palgon$ ls -ls public/v1/catalogs/*
8 -rw-r--r--  1 palgon  staff  1910 Nov 19 10:45 public/v1/catalogs/index.html

public/v1/catalogs/56463366e4b0fd1162b7d847:
total 88
48 -rw-r--r--  1 palgon  staff  20521 Nov 19 10:45 apis
 8 -rw-r--r--  1 palgon  staff   3883 Nov 19 10:45 apps
 8 -rw-r--r--  1 palgon  staff    123 Nov 19 10:45 consumers
 8 -rw-r--r--  1 palgon  staff   1788 Nov 19 10:45 products
16 -rw-r--r--  1 palgon  staff   7159 Nov 19 10:45 subscriptions
jons-mbp:http-server palgon$ ls *.pem
cert.pem	key.pem
jons-mbp:http-server palgon$ node bin/http-server -S
```

## Example
```js
var apimpull = require('../index').pull;
var options = {
    host : 'apim.ibm.com'    // defaults to '127.0.0.1'
    port : 8080              // defaults to 443
    timeout : 20             // defaults to 30 seconds
    srvca: 'srvca.pem'       // defaults to 'ca.pem'
    clikey : 'mykey.pem'     // defaults to 'key.pem'
    clipass : 'mypassphrase' // defaults to null
    clicert : 'mycert.pem'   // defaults to 'cert.pem'
    outdir : 'mydir'         // defaults to 'apim'
}
apimpull(options, function(err, response) {});
```
## CLI help
```  
apim-export -h
```

## What still needs work?
Quite a bit.  There's probably more, but here's a few for starters:

1. ~~Make a CLI interface to module so it can be run standalone~~ **DONE**
1. ~~Test with latest APIm~~ **DONE**
1. Automated testing
1. Ask for input directory, and use *etag* from existing filenames in input directory to only download new files if they have changed (needs etags to be implemented on APIm side for JSON APIs first)
1. Work with APIm team on reducing duplication in source files
1. Work with APIm team on creating endpoint that will only list catalogs that are applicable to the specific gateway node
1. Use CA certificate for validating the server's certificate
1. ~~Clean up/optimize code~~ **DONE**
