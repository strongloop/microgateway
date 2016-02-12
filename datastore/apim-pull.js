/**
 * Module dependencies
 */
var fs = require('fs'),
    request = require('request'),
    async = require('async'),
    extend = require('util')._extend;

/**
 * Module exports
 */
module.exports = {
  pull: apimpull
};

/**
 * Module constants
 */
var APIM_CATALOG_ENDP = '/v1/catalogs',
    APIM_APIS_ENDP = '/apis',
    APIM_PRODUCTS_ENDP= '/products',
    APIM_SUBS_ENDP= '/subscriptions',
    APIM_TLS_ENDP= '/tls-profiles',
    APIM_TYPE_FILTER= 'strong-gateway',
    APIM_CLIENT_ID_EQ= 'client_id=',
    APIM_TYPE_EQ='type=';

/**
 * Globals
 */
var response = {};
var result; 

/**
 * Creates a model type 
 * @class
 * @param {string} name - name of the model
 * @param {string} prefix - file name prefix associated with the model
 */ 
function ModelType(name, prefix, endp) {
  this.name = name;
  this.prefix = prefix;
  this.endp = endp;
}

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
    outdir : opts.outdir || 'apim',
    clientid : opts.clientid || '1111-1111'
  };
  /* First, start w/ catalogs */
  pullcatalog(options, function(err, catalogs, models) {
      if (err) {
        cb(err, response);
      }
      else if (typeof catalogs !== 'undefined') {
        getDataBasedOnCatalog(options, catalogs, models, cb);
      }
      else {
        cb(null, response);
      }
    }
  );
}

/**
 * Fetches data from APIm for each catalog
 * such as APIs, products and subscriptions
 */
function getDataBasedOnCatalog(options, catalogs, models, cb) {

  async.each(catalogs,
    function(catalog, catcallback) {
      /* Next, go to APIs for each catalog */
      async.each(models,
        function(model, modelcallback) {
          pullDataFromEndp(options, catalog, model, function(err) {
              if (err) {
                console.error(err);
              }
              modelcallback(err);
            }
          );
        },
        function(err) {
          catcallback(err);
        }
      );
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
  opts.path = APIM_CATALOG_ENDP + 
              '?' + // filter parms
              APIM_CLIENT_ID_EQ + opts.clientid + '&' + 
              APIM_TYPE_EQ + APIM_TYPE_FILTER;
  opts.prefix = '/catalogs-';
  opts.suffix = '.json';
  fetch(opts, function (err, file) {
      if (err) {
        cb(err);
      }
      else if ('object' === typeof result) {
        response.catalogs = result.file;
        var models = [];
        models.push(new ModelType('products', 'products-', APIM_PRODUCTS_ENDP));
        models.push(new ModelType('apis', 'apis-', APIM_APIS_ENDP));
        models.push(new ModelType('subscriptions', 'subs-', APIM_SUBS_ENDP));
        models.push(new ModelType('tlsprofiles', 'tlsprofs-', APIM_TLS_ENDP));
        models.forEach(
          function(model) {
            response[model.name] = [];
          }
        );
        var catalogsJSON;
        try {
          catalogsJSON = JSON.parse(result.contents);
        } catch (e) {
          cb(e);
          return;
        }
        var catalogs = [];
        catalogsJSON.forEach(function(obj) {
            catalogs.push({
              org : obj.organization.id,
              cat : obj.id
            }); 
          }
        );
        cb(null, catalogs, models);
      }
      else {
        var error = 
          new Error('Unexpected type returned from catalog fetch');
        cb(error);
      }
    }
  );
}

/**
 * Fetches response from APIm endpoint, persists the 
 * response to the filesystem '<outdir>/<model.prefix><org>-<catalog>-<etag>.json'
 */
function pullDataFromEndp (opts, catalog, model, cb) {
  var myopts = extend({}, opts);
  myopts.path = APIM_CATALOG_ENDP + '/' + catalog.cat + model.endp + 
                '?' + // filter parms
                APIM_CLIENT_ID_EQ + opts.clientid + '&' +
                APIM_TYPE_EQ + APIM_TYPE_FILTER;
  myopts.prefix = '/' + model.prefix + catalog.org + '-' + catalog.cat + '-';
  myopts.suffix = '.json';
  fetch(myopts, function (err, result) {
      if (err) {
        cb(err);
      }
      else if ('object' === typeof result) {
        response[model.name].push(result.file);
        cb();
      }
      else {
        var error = 
          new Error('Unexpected type returned from ' + model.name + ' fetch');
        cb(error);
      }
    }
  );
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
        outstream.write(JSON.stringify(JSON.parse(body),null,4));
        outstream.end();
        outstream.on('finish', function() {
            result = {
              file : filename,
              contents : body
            };
            cb(null, result);
          }
        );
      }
      else {
        var error = new Error(opts.url +
                    ' failed with: ' +
                    res.statusCode);
        cb(error);
      }
    }
  );
  req.end();
}
