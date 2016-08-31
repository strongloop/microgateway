// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/**
 * Module dependencies
 */
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:apim-pull' });
var fs = require('fs-extra');
var path = require('path');
var request = require('request');
var async = require('async');
var extend = require('util')._extend;

var Crypto = require('crypto');

var environment = require('../utils/environment');
var KEYNAME = environment.KEYNAME;
var PASSWORD = environment.PASSWORD;
var gatewayMain = path.join(__dirname, '..');
var keyFile = path.join(gatewayMain, KEYNAME);
var passFile = path.join(gatewayMain, PASSWORD);

/**
 * Module exports
 */
module.exports = {
  pull: apimpull,
  decrypt: decryptData,
  encrypt: encryptData };

/**
 * Module constants
 */
var APIM_CATALOG_ENDP = '/v1/catalogs';
var APIM_APIS_ENDP = '/apis';
var APIM_PRODUCTS_ENDP = '/products';
var APIM_SUBS_ENDP = '/subscriptions';
var APIM_TLS_ENDP = '/tls-profiles';
var APIM_REGISTRIES_ENDP = '/registries';
var APIM_TYPE_FILTER = 'strong-gateway';
var APIM_CLIENT_ID_EQ = 'client_id=';
var APIM_TYPE_EQ = 'type=';

/**
 * Globals
 */
var indirFiles = [];
var response = {};

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
 *     (e.g. catalogs, APIs, products, plans, subscriptions)
 * from APIm, persists the configuration to disk and
 * responds with an array of files created
 *
 * @api public
 */
function apimpull(opts, cb) {
  var options = {
    host: opts.host || '127.0.0.1',
    port: opts.port || 443, // assume SSL
    timeout: opts.timeout * 1000 || 30 * 1000,
    srvca: opts.srvca ? opts.srvca : null,
    clikey: opts.clikey ? opts.clikey : null,
    clipass: opts.clipass,
    clicert: opts.clicert ? opts.clicert : null,
    indir: opts.indir,
    outdir: opts.outdir || 'apim',
    clientid: opts.clientid || '1111-1111' };

  if (opts.indir) {
    try {
      indirFiles = fs.readdirSync(opts.indir);
    } catch (e) {
      logger.error(e);
      // not fatal; continue
    }
  }

  /* First, start w/ catalogs */
  pullcatalog(options, function(err, catalogs, models) {
    if (err) {
      cb(err, response);
    } else if (typeof catalogs !== 'undefined') {
      getDataBasedOnCatalog(options, catalogs, models, cb);
    } else {
      cb(null, response);
    }
  });
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
              logger.error(err);
            }
            modelcallback(err);
          });
        },
        function(err) {
          catcallback(err);
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
function pullcatalog(opts, cb) {
  opts.path = APIM_CATALOG_ENDP +
              '?' + // filter parms
              APIM_CLIENT_ID_EQ + opts.clientid + '&' +
              APIM_TYPE_EQ + APIM_TYPE_FILTER;
  opts.prefix = 'catalogs-';
  opts.suffix = '.json';
  fetch(opts, function(err, result) {
    if (err) {
      cb(err);
    } else if (typeof result === 'object') {
      response.catalogs = result.file;
      var models = [];
      models.push(new ModelType('products', 'products-', APIM_PRODUCTS_ENDP));
      models.push(new ModelType('apis', 'apis-', APIM_APIS_ENDP));
      models.push(new ModelType('subscriptions', 'subs-', APIM_SUBS_ENDP));
      models.push(new ModelType('tlsprofiles', 'tlsprofs-', APIM_TLS_ENDP));
      models.push(new ModelType('registries', 'registries-', APIM_REGISTRIES_ENDP));
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
          org: obj.organization.id,
          cat: obj.id });
      });
      cb(null, catalogs, models);
    } else {
      var error = new Error('Unexpected type returned from catalog fetch');
      cb(error);
    }
  });
}

/**
 * Fetches response from APIm endpoint, persists the
 * response to the filesystem '<outdir>/<model.prefix><org>-<catalog>-<etag>.json'
 */
function pullDataFromEndp(opts, catalog, model, cb) {
  var myopts = extend({}, opts);
  myopts.path = APIM_CATALOG_ENDP + '/' + catalog.cat + model.endp + '?' + // filter parms
      APIM_CLIENT_ID_EQ + opts.clientid + '&' + APIM_TYPE_EQ + APIM_TYPE_FILTER;
  myopts.prefix = model.prefix + catalog.org + '-' + catalog.cat + '-';
  myopts.suffix = '.json';

  fetch(myopts, function(err, result) {
    if (err) {
      cb(err);
    } else if (typeof result === 'object') {
      response[model.name].push(result.file);
      cb();
    } else {
      var error = new Error('Unexpected type returned from ' + model.name + ' fetch');
      cb(error);
    }
  });
}

/**
 * Fetches response from APIm endpoint, persists the response to the
 * filesystem '<outdir>/<prefix><etag><postfix>'
 */
function fetch(opts, cb) {
  var options = {
    url: 'https://' + opts.host + ':' + opts.port + opts.path,
    timeout: opts.timeout,
    agentOptions: {
      cert: opts.clicert,
      key: opts.clikey,
      passphrase: opts.clipass,
      ca: opts.srvca,
      // TODO : remove this
      rejectUnauthorized: false } };

  fetchFromCache(options, opts, function(err, cached) {
    if (err) {
      cb(err);
    } else if (cached) {
      cb(null, cached);
    } else {
      fetchFromServer(options, opts, cb);
    }
  });
}

/**
 * Uses cached configuration if still fresh
 */
function fetchFromCache(options, opts, cb) {
  // look for existing cached resource
  if (indirFiles.length > 0) {
    var etag;
    var regexp = '^' + opts.prefix +
                 '([A-Za-z0-9]+={0,2})' + // base64 encoded
                 opts.suffix + '$';
    var regex = new RegExp(regexp);
    var i;
    for (i = 0; i < indirFiles.length; i++) {
      var file = regex.exec(indirFiles[i]);
      if (file) {
        etag = new Buffer(file[1], 'base64').toString();
        break;
      }
    }

    if (etag) {
      try {
        var headOpts = JSON.parse(JSON.stringify(options)); // clone options
        headOpts.headers = { 'If-None-Match': etag };
        request.head(headOpts, function(err, res, body) {
          if (err) {
            logger.error(err);
            cb();
            // not fatal; continue
          } else if (res.statusCode === 304) {
            var filename = path.join(opts.outdir, indirFiles[i]);
            fs.copy(path.join(opts.indir, indirFiles[i]),
                    filename,
                    { preserveTimestamps: true },
                    function(err) {
                      if (err) {
                        throw (err);
                      }
                      var body = decryptData(fs.readFileSync(filename));
                      logger.info('Using cached copy of %s', indirFiles[i]);
                      var result = {
                        file: filename,
                        contents: body };
                      cb(null, result);
                    });
          } else {
            cb();
          }
        });
      } catch (e) {
        logger.error(e);
        cb();
        // not fatal; continue
      }
    } else {
      cb();
    }
  } else {
    cb();
  }
}

/**
 * Retrieves resource from server
 */
function fetchFromServer(options, opts, cb) {
  var req = request.get(options, function(err, res, body) {
    if (err) {
      cb(err);
    } else if (res.statusCode === 200) {
      var etag = res.headers.etag ? res.headers.etag : '';
      var filename = path.join(opts.outdir, opts.prefix +
                     new Buffer(etag).toString('base64') + opts.suffix);
      var outstream = fs.createWriteStream(filename);
      outstream.write(encryptData(JSON.stringify(JSON.parse(body), null, 4)));
      outstream.end();
      outstream.on('finish', function() {
        var result = {
          file: filename,
          contents: body };
        cb(null, result);
      });
    } else {
      var error = new Error(options.url + ' failed with: ' + res.statusCode);
      cb(error);
    }
  });

  req.end();
}

function getKey(file) {
  // load key..
  var key = '';
  try {
    key = fs.readFileSync(file, 'utf8');
  } catch (e) {
    logger.debug('Can not read file: %s Error: %s', file, e);
  }
  return key;
}

var algorithm = 'AES-256-CBC';
var IV = '0000000000000000';

function decryptData(data) {
   //if we cant decrypt.. just pass original data..
  var decryptedData = data;
  var pass = getOrCreatePass();
  if (pass !== '') {
    var decipher = Crypto.createDecipheriv(algorithm, pass, IV);
    decryptedData = decipher.update(data, 'base64', 'utf8');
    decryptedData += decipher.final('utf8');
  }
  return decryptedData;
}

function encryptData(data) {
  //if we cant encrypt.. just pass clear data..
  var encryptedData = data;
  var pass = getOrCreatePass();
  if (pass !== '') {
    var cipher = Crypto.createCipheriv(algorithm, pass, IV);
    encryptedData = Buffer.concat([ cipher.update(new Buffer(data)), cipher.final() ]);
  }
  return encryptedData;
}

function getOrCreatePass() {
  var pass_key = '';
  var private_key;
  try {
    fs.statSync(passFile);
    // file found
    private_key = getKey(keyFile);
    pass_key = Crypto.privateDecrypt(private_key, new Buffer(getKey(passFile)));
  } catch (err) {
    // no file.. create it..
    private_key = getKey(keyFile);
    // no key, can't crate it..
    if (private_key !== '') {
      var password = Crypto.createHash('sha256').update('apimanager').digest();
      var encryptedCipher = Crypto.publicEncrypt(private_key, new Buffer(password));
      // write password to file..
      try {
        fs.writeFileSync(passFile, encryptedCipher);
      } catch (e) {
        logger.debug('Can not write file: %s Error: %s', passFile, e);
      }
      pass_key = password;
    }
  }

  return pass_key;
}

