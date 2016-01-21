/**
 * Module dependencies
 */
var fs = require('fs'),
    request = require('request'),
    async = require('async'),
    jsyaml = require('js-yaml');

/**
 * Module exports
 */
module.exports = {
    pull: apimpull
};

/**
 * Module constants
 */
var APIM_CATALOG_ENDP = '/v1/catalogs/',
    APIM_APIS_ENDP = '/apis',
    APIM_PRODUCTS_ENDP= '/products',
    APIM_SUBS_ENDP= '/subscriptions';

/**
 * Globals
 */
var response = {};
var result; 

/**
 * Pulls latest configuration 
 * 	(e.g. catalogs, APIs, products, plans, subscriptions)
 * from APIm, persists the configuration to disk and 
 * responds with an array of files created
 *
 * @api public
 */
function apimpull (opts, cb) {
    var key = opts.clikey || 'key.pem';
    var cert = opts.clicert || 'cert.pem';
    var srvca = opts.srvca || 'ca.pem';
    var options = {
        host : opts.host || '127.0.0.1',
        port : opts.port || 443, // assume SSL
        timeout : opts.timeout * 1000 || 30 * 1000,
        srvca : opts.srvca ? fs.readFileSync(srvca) : null,
        clikey : opts.clikey ? fs.readFileSync(key) : null,
        clipass : opts.clipass,
        clicert : opts.clicert ? fs.readFileSync(cert)  : null,
        outdir : opts.outdir || 'apim'
    };
    /* First, start w/ catalogs */
    pullcatalog(options, function(err, catalogs) {
        if (err) {
            cb(err, response);
        }
        else if (typeof catalogs !== 'undefined') {
            getapisproductsandsubs(options, catalogs, cb);
        }
        else {
            cb(null, response);
        }
    });
}

/**
 * Fetches APIm APIs, products and subscriptions for each catalog
 */
function getapisproductsandsubs(options, catalogs, cb) {
    var catalogsWithAPIs = [];
    async.each(catalogs,
        function(catalog, callback) {
                /* Next, go to APIs for each catalog */
                pullapis(options, catalog, function(err) {
                    if (err) {
                        console.error(err);
                    }
                    else {
                        catalogsWithAPIs.push(catalog);
                    }
                    callback();
                });
        },
        function(err) {
            if(err) {
                cb(err, response);
            }
            else {
                getproductsandsubs(options, catalogsWithAPIs, cb);
            }
        }
    );
}

/**
 * Fetches APIm products and subscriptions for each catalog that contains APIs
 */
function getproductsandsubs(options, catalogsWithAPIs, cb) {
    async.each(catalogsWithAPIs,
        function(catalog, callback) {
            /* Next, go to products for each catalog */
            pullproducts(options, catalog, function(err) {
                if (err) {
                    console.error(err);
                }
                callback();
            });
        },
        function(err) {
            if(err) {
                cb(err, response);
            }
            else {
                getsubs(options, catalogsWithAPIs, cb);
            }
        }
    );
}

/**
 * Fetches APIm subscriptions for each catalog that contains APIs
 */
function getsubs(options, catalogsWithAPIs, cb) {
    async.each(catalogsWithAPIs,
        function(catalog, callback) {
            /* Finally, go to subscriptions for each catalog */
            pullsubs(options, catalog, function(err) {
                if (err) {
                    console.error(err);
                }
                callback();
            });
        },
        function(err) {
            cb(err, response);
        }
    );
}

/**
 * Fetches response from  APIm catalogs endpoint, persists the response to the
 * filesystem '<outdir>/catalogs-<etag>.json'
 */
function pullcatalog (opts, cb) {
    opts.path = APIM_CATALOG_ENDP;
    opts.prefix = '/catalogs-';
    opts.suffix = '.json';
    fetch(opts, function (err, file) {
        if (err) {
            cb(err);
        }
        else if ('object' === typeof result) {
            response.catalogs = result.file;
            response.products = [];
            response.apis = [];
            response.api = [];
            response.subs = [];
            var catalogsJSON = JSON.parse(result.contents);
            var catalogs = [];
            catalogsJSON.forEach(function(obj) {
                catalogs.push({
                    org : obj.organization.id,
                    cat : obj.id
                }); 
            });
            cb(null, catalogs);
        }
        else {
            var error = 
		new Error('Unexpected type returned from catalog fetch');
            cb(error);
        }
    });
}

/**
 * Fetches response from  APIm apis endpoint, persists the response to the
 * filesystem '<outdir>/apis-<org>-<catalog>-<etag>.json' and 
 * create YAML version of Swagger document to persist to filesystem: 
 * '<outdir>/api-<org>-<catalog>-<apiname>-<apiver>-<etag>.yml'
 */
function pullapis (opts, catalog, cb) {
    opts.path = APIM_CATALOG_ENDP + catalog.cat + APIM_APIS_ENDP;
    opts.prefix = '/apis-' + catalog.org + '-' + catalog.cat + '-';
    opts.suffix = '.json';
    fetch(opts, function (err, result) {
        if (err) {
            cb(err);
        }
        else if ('object' === typeof result) {
            response.apis.push(result.file);
            var apisJSON = JSON.parse(result.contents);
            var fileParts = result.file.split('-');
            var etag = fileParts[fileParts.length - 1].split('.')[0];
            async.each(apisJSON,
                function(obj, callback) {
                    var filename = opts.outdir + '/api-' + catalog.org + '-' +
                        catalog.cat + '-' + obj.document.info['x-ibm-name'] +
                        '-' + obj.document.info.version + '-' + etag +
                        '.yml';
                    var outstream = fs.createWriteStream(filename);
                    response.api.push(filename);
                    outstream.write(jsyaml.safeDump(obj.document));
                    outstream.end();
                    outstream.on('finish', function() {
                        callback();
                    });
                },
                function(err) {
                    cb(err);
                }
            );
        }
        else {
            var error = new Error('Unexpected type returned from api fetch');
            cb(error);
        }
    });
}

/**
 * Fetches response from APIm products endpoint, persists the response to the
 * filesystem '<outdir>/products-<org>-<catalog>-<etag>.json'
 */
function pullproducts (opts, catalog, cb) {
    opts.path = APIM_CATALOG_ENDP + catalog.cat + APIM_PRODUCTS_ENDP;
    opts.prefix = '/products-' + catalog.org + '-' + catalog.cat + '-';
    opts.suffix = '.json';
    fetch(opts, function (err, result) {
        if (err) {
            cb(err);
        }
        else if ('object' === typeof result) {
            response.products.push(result.file);
            cb();
        }
        else {
            var error = 
			new Error('Unexpected type returned from product fetch');
            cb(error);
        }
    });
}

/**
 * Fetches response from APIm subscriptions endpoint, persists the 
 * response to the filesystem '<outdir>/subs-<org>-<catalog>-<etag>.json'
 */
function pullsubs (opts, catalog, cb) {
    opts.path = APIM_CATALOG_ENDP + catalog.cat + APIM_SUBS_ENDP;
    opts.prefix = '/subs-' + catalog.org + '-' + catalog.cat + '-';
    opts.suffix = '.json';
    fetch(opts, function (err, result) {
        if (err) {
            cb(err);
        }
        else if ('object' === typeof result) {
            response.subs.push(result.file);
            cb();
        }
        else {
            var error = 
		new Error('Unexpected type returned from subscription fetch');
            cb(error);
        }
    });
}

/**
 * Fetches response from APIm endpoint, persists the response to the
 * filesystem '<outdir><prefix><etag><postfix>'
 *
 * TODO - optimize to only fetch if current version is not fresh
 */
function fetch (opts, cb) {

    var options = {
        url : 'https://' + opts.host + ':' + opts.port + opts.path,
        timeout : opts.timeout,
        agentOptions: {
            cert : opts.clicert,
            key : opts.clikey,
            passphrase : opts.clipass,
            ca : opts.srvca,
            rejectUnauthorized : false // TODO : remove this
        }
    };
    var req = request.get(options, function(err, res, body) {
        if (err) {
            cb(err);
        }
        else if (res.statusCode === 200) {
            var etag = res.headers['etag'] ? res.headers['etag'] : '';
            var filename = opts.outdir + opts.prefix + 
                           new Buffer(etag).toString('base64') +
                           opts.suffix;
            var outstream = fs.createWriteStream(filename);
            outstream.write(body);
            outstream.end();
            outstream.on('finish', function() {
            result = {
                    file : filename,
                    contents : body
                };
                cb(null, result);
            });
        }
        else {
            var error = new Error(opts.url +
                                  ' failed with: ' +
                                  res.statusCode);
            cb(error);
        }
    });
    req.end();
}
