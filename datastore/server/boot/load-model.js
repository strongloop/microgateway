// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var fs = require('fs-extra');
var path = require('path');
var async = require('async');
var YAML = require('yamljs');
var constants = require('constants');
var Crypto = require('crypto');
var Request = require('request');
var url = require('url');
var checkSecurity = require('./check-security');
var ip = require('ip');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:server:boot:load-model' });
var sgwapimpull = require('../../apim-pull');
var apimpull = sgwapimpull.pull;
var apimdecrypt = sgwapimpull.decrypt;
var utils = require('../../common/utils/utils');
var getPreviousSnapshotDir = utils.getPreviousSnapshotDir;
var setPreviousSnapshotDir = utils.setPreviousSnapshotDir;
var environment = require('../../../utils/environment');
var APIMANAGER = environment.APIMANAGER;
var APIMANAGER_PORT = environment.APIMANAGER_PORT;
var APIMANAGER_CATALOG = environment.APIMANAGER_CATALOG;
var CONFIGDIR = environment.CONFIGDIR;
var KEYNAME = environment.KEYNAME;

var LAPTOP_RATELIMIT = environment.LAPTOP_RATELIMIT;
var WH_SUBSCRIBE = 0;
var WH_UNSUBSCRIBE = 1;

var project = require('apiconnect-project');

var rootConfigPath = path.join(__dirname, '../../../config');
var definitionsDir = path.join(rootConfigPath, 'default');

var gatewayMain = path.join(__dirname, '../../..');
var keyFile = path.join(gatewayMain, KEYNAME);
var version = '1.0.0';
var mixedProtocols = false;
var http = false;
var https = false;
var models = [];
var apimanager = {};
var currentWebhook;

/**
 * Creates a model type
 * @class
 * @param {string} name - name of the model
 * @param {string} prefix - file name prefix associated with the model
 */
function ModelType(name, prefix) {
  this.name = name;
  this.prefix = prefix;
  this.files = [];
}

/**
 * Generate a random snapshot identifier
 * @returns {string} - a random integer between
 *                     0 (included) 2^16 - 1 (included).
 */
function getSnapshotID() {
  return ('0000' + Math.floor(Math.random() * (65536))).slice(-5);
}

/**
 * Populates the data-store models AND periodically refreshes the information
 */
module.exports = function(app) {
  // Associate models with file names containing data that should be used
  // to populate the relevant model(s)
  // This section would need to be updated whenever new models are added
  // to the data-store
  models.push(new ModelType('catalog', 'catalogs-'));
  models.push(new ModelType('api', 'apis-'));
  models.push(new ModelType('product', 'products-'));
  models.push(new ModelType('subscription', 'subs-'));
  models.push(new ModelType('tlsprofile', 'tlsprofs-'));
  models.push(new ModelType('registry', 'registries-'));
  // add new models above this line
  models.push(new ModelType('optimizedData', 'dummy'));
  models.push(new ModelType('snapshot', 'dummy')); // hack, removed later

  var maxRefreshInterval = 15 * 60 * 1000; // 15 minutes
  if (process.env.APIMANAGER_REFRESH_INTERVAL) {
    maxRefreshInterval = process.env.APIMANAGER_REFRESH_INTERVAL;
  }
  apimanager = {
    host: process.env[APIMANAGER],
    port: process.env[APIMANAGER_PORT],
    catalog: process.env[APIMANAGER_CATALOG],
    handshakeOk: false,
    webhooksOk: false,
    startupRefresh: 1000, // 1 second
    maxRefresh: maxRefreshInterval };

  var uid;
  async.series([
    function(callback) {
      // get CONFIG_DIR.. two basic paths APIm load or local
      // if no ENV var, load default dir.. APIm
      // if ENV var,
      //    if apimanager specified, dir = 'last known config'..
      //    if no apimanager specified, dir will be loaded..
      delete process.env.ORIG_CONFIG_DIR;
      if (process.env[CONFIGDIR]) {
        process.env.ORIG_CONFIG_DIR = process.env[CONFIGDIR];
        definitionsDir = process.env[CONFIGDIR];
      } else if (getPreviousSnapshotDir()) {
        definitionsDir = getPreviousSnapshotDir();
        process.env[CONFIGDIR] = definitionsDir;
        var tempid = path.basename(definitionsDir);
        var tempidint = parseInt(tempid, 10);
        if (tempidint >= 0 && tempidint <= 65536) {
          uid = tempid;
        }
      }
      process.env.ROOTCONFIGDIR = path.dirname(definitionsDir);
      setPreviousSnapshotDir(definitionsDir);
      callback();
    },
    // stage the models
    function(callback) {
      stageModels(app, models, function(err) {
        models.pop(); // remove snapshot model
        models.pop(); // remove optimizedData model
        callback(err);
      });
    },
    function(callback) {
      if (!apimanager.host) {
        //if we don't have the APIM contact info, bail out
        return callback();
      }

      // load key..
      var private_key = null;
      try {
        private_key = fs.readFileSync(keyFile, 'utf8');
      } catch (e) {
        //don't proceed with the handshake, since we could not read the private key
        logger.warn('Can not load key: %s Error: %s', keyFile, e);
        return callback(); // TODO: treat as error
        //don't treat as error currently because UT depends on this
      }

      // we have an APIm, and a key so try to handshake with it..
      handshakeWithAPIm(app, apimanager, private_key, function(err) {
        if (err) { /* suppress eslint handle-callback-err */ }
        callback(); // TODO: treat as error
        //don't treat as error currently because UT depends on this
      });
    },
    function(callback) {
      if (!apimanager.host) {
        //if we don't have the APIM contact info, bail out
        return callback();
      }

      webhooksSubscribe(app, apimanager, WH_UNSUBSCRIBE, function(err) {
        if (err) {} // TODO: treat as error
        callback();
        //don't treat as error currently because UT depends on this
      });
    },
    function(callback) {
      if (!apimanager.host) {
        //if we don't have the APIM contact info, bail out
        return callback();
      }

      webhooksSubscribe(app, apimanager, WH_SUBSCRIBE, function(err) {
        if (err) {} // TODO: treat as error
        callback();
        //don't treat as error currently because UT depends on this
      });
    } ],
    // load the data into the models
    function(err) {
      if (!err) {
        loadData(app, apimanager, models, true, uid);
      }
      if (!apimanager.host) {
        //monitor the file changes, load data again if any changes
        fs.watch(definitionsDir, function(event, filename) {
          if (filename !== '.datastore') {
            logger.debug('File changed in %s%s, reload data', definitionsDir, filename);
            loadData(app, apimanager, models, false, uid);
          }
        });
      }
    });
};

/**
 * Loads the data into models, and periodically refreshes the data
 * @param {???} app - loopback application
 * @param {Object} config - configuration pointing to APIm server
 * @param {Array} models - instances of ModelType to populate with data
 * @param {bool} reload - set a timer to trigger a future reload
 */
function loadData(app, apimanager, models, reload, uid) {
  var currdir = getPreviousSnapshotDir();
  var snapdir;
  var snapshotID = getSnapshotID();
  var populatedSnapshot = false;

  async.series([
    function(callback) {
      logger.debug('apimanager before pullFromAPIm: %j', apimanager);
      if (apimanager.host) {
          // && apimanager.handshakeOk << shouldn't call if handshake failed.. not ready #TODO
          // && apimanager.webhooksOk << shouldn't call if handshake failed.. not ready #TODO
          // don't look for successful handshake/webhooks currently because UT depends on this
        // we have an APIm, handshake succeeded, so try to pull data..
        pullFromAPIm(apimanager, currdir, snapshotID, function(err, dir) {
          if (err) {
            if (uid) {
              snapshotID = uid;
            } // in case of error, try the previous snapshot
          }
          snapdir = dir; // even in case of error, we need to try loading from the file system
          callback();
        });
      } else {
        snapdir = '';
        callback();
      }
    },
    // populate snapshot model
    function(callback) {
      populateSnapshot(app, snapshotID, callback);
    },
    // load current config
    function(callback) {
      populatedSnapshot = true;
      loadConfig(app,
                 apimanager,
                 models,
                 currdir,
                 snapdir,
                 snapshotID,
                 callback);
    } ],
    function(err, results) {
      if (!reload) {
        return;
      }
      var interval = apimanager.maxRefresh;
      // if no error and APIs specified, do not agressively reload config
      if (!err && apimanager.host && (http || https)) {
        apimanager.startupRefresh = interval;
        // if the previous snapshot hasn't be loaded, delete it
        if (uid && snapshotID !== uid) {
          try {
            fs.removeSync(currdir);
          } catch (e) {
            logger.error(e);
            //continue
          }
        }
      } else if (apimanager.startupRefresh < apimanager.maxRefresh) {
        // try agressively at first, and slowly back off
        interval = apimanager.startupRefresh;
        apimanager.startupRefresh *= 2;
      }
      if (err) {
        if (populatedSnapshot) {
          releaseSnapshot(app, snapshotID, function(err) {
            if (err) { /* suppress eslint handle-callback-err */ }
            process.send({ LOADED: false });
          });
        } else {
          process.send({ LOADED: false });
        }
      } else if (!apimanager.host || http || https) {
        // neither http nor https would be set if there were no APIs
        // defined; if no APIs defined, let's try again in a while
        process.send({ LOADED: true, https: https });
      }
      setImmediate(scheduleLoadData,
                   app,
                   interval,
                   apimanager,
                   models);
    });
}

function scheduleLoadData(app, interval, apimanager, models) {
  if (apimanager.host) {
    setTimeout(loadData, interval, app, apimanager, models, true);
  }
}

/**
 * Stages the models for use by subsequent functions
 * @param {???} app - loopback application
 * @param {Array} models - instances of ModelType to populate
 *                         with data
 * @param {callback} cb - callback that handles the error or
 *                        successful completion
 */
function stageModels(app, models, cb) {
  logger.debug('stageModels entry');
  async.forEach(models,
    function(model, callback) {
      app.dataSources.db.automigrate(
        model.name,
        function(err) {
          callback(err);
        }
      );
    },
    function(err) {
      logger.debug('stageModels exit');
      cb(err);
    }
  );
}
/**
 * Compute the signature headers "date", "digest", and "authorization" headers
 * according to IETF I-D draft-cavage-http-signatures-05 using rsa-sha256 algorithm
 *
 * If the `date` header already exists in the input, it's used as-is
 * If the `digest` header already exists in the input, it's used as-is (which means that body is ignored)
 *
 *
 * @param body (String): Message body (ignored if there is already a digest header)
 * @param headers (Object): Contains the existing list of headers
 * @param keyId (String): Identifier for the private key, ends up in the "keyId" param of the authorization header
 * @param private_key (String): RSA Private key to be used for the signature
 * @returns {*}
 */


function addSignatureHeaders(body, headers, keyId, private_key) {
  var sign = function(str, private_key) {
    var sign = Crypto.createSign('RSA-SHA256');
    sign.update(str);
    return sign.sign(private_key, 'base64');
  };

  var sha256 = function(str, encoding) {
    var bodyStr = JSON.stringify(str);
    var hash = Crypto.createHash('sha256');
    hash.update(bodyStr);
    return hash.digest(encoding);
  };

  if (!headers) {
    headers = {};
  }

  if (!headers.date) {
    headers.date = (new Date()).toUTCString();
  }

  if (!headers.digest) {
    headers.digest = 'SHA256=' + sha256(body, 'base64');
  }


  var combine = function(names, headers) {
    var parts = [];
    names.forEach(function(e) {
      parts.push(e + ': ' + headers[e]);
    });
    return parts.join('\n');
  };

  headers.authorization = 'Signature ' +
    'keyId="' + keyId + '", ' +
    'headers="date digest", ' +
    'algorithm="rsa-sha256", ' +
    'signature="' + sign(combine([ 'date', 'digest' ], headers), private_key) + '"';

  return headers;
}


/**
 * This function decrypts and parses an encrypted response body sent by APIM
 * The body must be in the following format:
 *
 * {
 *   "key": "base64(encrypted_with_public_key(aes_256_symmetric_key))"
 *   "cipher": "base64(encrypted_with_aes_256_key(json_payload_as_string))"
 * }
 *
 *
 * @param body
 * @param public_key
 *
 */
function decryptAPIMResponse(body, private_key) {
  var key = Crypto.privateDecrypt(
    { key: private_key,
      padding: constants.RSA_PKCS1_PADDING },
    new Buffer(body.key, 'base64')
  );

  var iv = new Buffer(16);
  iv.fill(0);
  var decipher = Crypto.createDecipheriv('aes-256-cbc', key, iv);
  var plainText = decipher.update(body.cipher, 'base64', 'utf8');
  plainText += decipher.final('utf8');

  return JSON.parse(plainText);
}


/**
 * Webhooks subscription with APIm server
 * @param {???} app - loopback application
 * @param {Object} apimanager - configuration pointing to APIm server
 * @param {Object} operation - either WH_SUBSCRIBE or WH_UNSUBSCRIBE
 * @param {callback} cb - callback that handles error
 */
function webhooksSubscribe(app, apimanager, operation, cb) {
  logger.debug('webhooksSubscribe entry');

  var whMethod, whTitle, whVerb, whStatusCode;
  switch (operation) {
    case WH_SUBSCRIBE:
      whMethod = 'POST';
      whTitle = 'This is a webhook subscription for the a catalog, subscribing to all available events specifically';
      whVerb = 'subscribe';
      whStatusCode = 201;
      break;
    case WH_UNSUBSCRIBE:
      whMethod = 'DELETE';
      whTitle = 'This is a webhook unsubscribe for the a catalog, unsubscribing to all available events specifically';
      whVerb = 'unsubscribe';
      whStatusCode = 204;
      break;
    default:
      cb(new Error('Internal error during webhooks subscribe/unsubscribe'));
      return;
  }

  async.series([
    function(callback) {

      var endpointurlObj = {
        protocol: 'http',
        hostname: ip.address(),
        port: process.env.DATASTORE_PORT,
        pathname: '/api/webhooks',
      };
      var endpointurl = url.format(endpointurlObj);
      var body = {
        enabled: 'true',
        endpoint: endpointurl,
        secret: 'notused',
        subscriptions: [
          'catalog',
        ],
        title: whTitle,
      };

      var headers = {
        'content-type': 'application/json',
        'x-ibm-client-id': apimanager.clientid,
        accept: 'application/json',
      };

      if (logger.debug()) {
        logger.debug(JSON.stringify(headers, null, 2));
      }

      var webhooksSubUrlObj = {
        protocol: 'https',
        hostname: apimanager.host,
        port: apimanager.port,
        pathname: '/v1/catalogs/' + apimanager.catalog + '/webhooks',
        search: 'type=strong-gateway',
      };
      var webhooksSubUrl = url.format(webhooksSubUrlObj);

      Request({
        url: webhooksSubUrl,
        method: whMethod,
        json: body,
        headers: headers,
        agentOptions: {
          rejectUnauthorized: false, //FIXME: need to eventually remove this
        },
      },
      function(err, res, body) {
        if (err) {
          logger.error('Failed to communicate with %s: %s ', webhooksSubUrl, err);
          return callback(err);
        }

        logger.debug('statusCode: ' + res.statusCode);
        if (res.statusCode !== whStatusCode) {
          logger.error(webhooksSubUrl, ' failed with: ', res.statusCode);
          currentWebhook = undefined;
          return callback(new Error(webhooksSubUrl + ' failed with: ' + res.statusCode));
        } else if (operation === WH_SUBSCRIBE) {
          logger.debug('Webhooks subscribe received response %d from API Connect server, id %s',
                       res.statusCode, body.id);
          currentWebhook = body.id;
        } else if (operation === WH_UNSUBSCRIBE) {
          logger.debug('Webhooks unsubscribe received response %d from API Connect server',
                       res.statusCode);
          currentWebhook = undefined;
        }

        callback(null);
      });
    } ],
    function(err) {
      if (err) {
        apimanager.webhooksOk = false;
        logger.error('Unsuccessful webhooks ' + whVerb + ' with API Connect server');
      } else {
        apimanager.webhooksOk = true;
        logger.info('Successful webhooks ' + whVerb + ' with API Connect server');
      }
      logger.debug('webhooksSubscribe exit');
      cb(err);
    });
}


/**
 * Attempt to handshake from APIm server
 * @param {???} app - loopback application
 * @param {Object} apimanager - configuration pointing to APIm server
 * @param {string} privatekey - private key to be used for handshake
 * @param {callback} cb - callback that handles error
 */
function handshakeWithAPIm(app, apimanager, private_key, cb) {
  logger.debug('handshakeWithAPIm entry');

  async.series([
    function(callback) {
      var body = JSON.stringify({ gatewayVersion: version });
      var headers = { 'content-type': 'application/json' };

      addSignatureHeaders(body, headers, 'micro-gw-catalog/' + apimanager.catalog, private_key);

      if (logger.debug()) {
        logger.debug(JSON.stringify(headers, null, 2));
      }

      var apimHandshakeUrlObj = {
        protocol: 'https',
        hostname: apimanager.host,
        port: apimanager.port,
        pathname: '/v1/catalogs/' + apimanager.catalog + '/handshake/' };
      var apimHandshakeUrl = url.format(apimHandshakeUrlObj);

      Request(
        { url: apimHandshakeUrl,
          method: 'POST',
          json: body,
          headers: headers,
          agentOptions: {
            //FIXME: need to eventually remove this
            rejectUnauthorized: false } },
        function(err, res, body) {
          if (err) {
            logger.error('Failed to communicate with %s: %s ', apimHandshakeUrl, err);
            return callback(err);
          }

          logger.debug('statusCode: ' + res.statusCode);
          if (res.statusCode !== 200) {
            logger.error(apimHandshakeUrl, ' failed with: ', res.statusCode);
            return callback(new Error(apimHandshakeUrl + ' failed with: ' + res.statusCode));
          }

          var json = decryptAPIMResponse(body, private_key);
          //sensitive data
          //if (logger.debug()) {
          //  logger.debug(JSON.stringify(json, null, 2));
          //}

          if (!json.microGateway) {
            return callback(new Error(apimHandshakeUrl + ' response did not contain "microGateway" section'));
          }

          var ugw = json.microGateway;
          apimanager.clicert = ugw.cert;
          apimanager.clikey = ugw.key;
          apimanager.clientid = ugw.clientID;

          //sensitive data
          //if (logger.debug()) {
          //  logger.debug('apimanager: %s', JSON.stringify(apimanager, null, 2));
          //}
          callback(null);
        });
    } ],
    function(err) {
      if (err) {
        apimanager.handshakeOk = false;
        logger.error('Unsuccessful handshake with API Connect server');
      } else {
        apimanager.handshakeOk = true;
        logger.info('Successful handshake with API Connect server');
      }
      logger.debug('handshakeWithAPIm exit');
      cb(err);
    });
}

/**
 * Attempt to request data from APIm server and persist to disk
 * @param {Object} config - configuration pointing to APIm server
 * @param {string} currdir - current snapshot symbolic link path
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or path to
 *                        snapshot directory
 */
function pullFromAPIm(apimanager, currdir, uid, cb) {
  logger.debug('pullFromAPIm entry');
  // Have an APIm, grab latest if we can..
  var snapdir = path.join(process.env.ROOTCONFIGDIR, uid);

  fs.mkdirs(snapdir, function(err) {
    if (err) {
      logger.warn('Failed to create snapshot directory');
      logger.debug('pullFromAPIm exit(1)');
      cb(err, '');
      return;
    }
    /*
    var options = {
      host: host of APIm
      port: port of APIm
      timeout: opts.timeout * 1000 || 30 * 1000,
      clikey: opts.clikey ? opts.clikey : null,
      clicert: opts.clicert ? opts.clicert  : null,
      clientid: opts.clientid || '1111-1111',
      outdir: opts.outdir || 'apim' };
    */

    var options = {};
    options.host = apimanager.host;
    options.port = apimanager.port;
    options.clikey = apimanager.clikey;
    options.clicert = apimanager.clicert;
    options.clientid = apimanager.clientid;
    options.indir = currdir;
    options.outdir = snapdir;

    logger.debug('apimpull start');
    apimpull(options, function(err, response) {
      if (err) {
        logger.error(err);
        try {
          fs.removeSync(snapdir);
        } catch (e) {
          logger.error(e);
          //continue
        }
        snapdir = '';
        // falling through
        // try loading from local files
      } else {
        logger.info('Successfully pulled snapshot from API Connect server');
      }
      logger.debug(response);
      logger.debug('pullFromAPIm exit(2)');
      cb(err, snapdir);
    });
  });
}

/**
 * Loads persisted data from disk and populates models and updates
 * 'current snapshot'
 * @param {???} app - loopback application
 * @param {Array} models - instances of ModelType to populate with data
 * @param {string} currdir - current snapshot symbolic link path
 * @param {string} snapdir - path to directory containing persisted data to load
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or successful completion
 */
function loadConfig(app, apimanager, models, currdir, snapdir, uid, cb) {
  logger.debug('loadConfig entry');
  var dirToLoad = (snapdir === '') ? currdir : snapdir;

  loadConfigFromFS(app, apimanager, models, dirToLoad, uid, function(err) {
    if (err) {
      logger.error(err);
      logger.debug('loadConfig error(1)');
      cb(err);
      return;
    } else if (mixedProtocols) {
      logger.debug('loadConfig error(2)');
      cb(new Error('mixed protocols'));
      return;
    } else {
      // update current snapshot pointer
      updateSnapshot(app, uid, function(err) {
        if (err) {
          logger.debug('loadConfig error(3)');
          cb(err);
          return;
        }

        // only update pointer to latest configuration
        // when latest configuration successful loaded
        if (snapdir === dirToLoad) {
          process.env[CONFIGDIR] = snapdir;
          setPreviousSnapshotDir(snapdir);
        }

        logger.debug('loadConfig exit');
        cb();
      });
    }
  });
}

/**
 * Loads persisted data from disk and populates models
 * @param {???} app - loopback application
 * @param {Array} models - instances of ModelType to populate with data
 * @param {string} dir - path to directory containing persisted data to load
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or successful completion
 */
function loadConfigFromFS(app, apimanager, models, dir, uid, cb) {
  // clear out existing files from model structure
  models.forEach(
    function(model) {
      model.files = [];
    }
  );

  if (apimanager.host) {
    var files = [];
    logger.debug('loadConfigFromFS entry');
    try {
      if (dir !== '') {
        files = fs.readdirSync(dir);
      }
    } catch (e) {
      logger.error('Failed to read directory: ', dir);
      cb(e);
      return;
    }

    logger.debug('files: ', files);
    var jsonFile = new RegExp(/.*\.json$/);
    // correlate files with appropriate model
    files.forEach(
      function(file) {
        logger.debug('file match jsonFile: ', file.match(jsonFile));
        if (file.match(jsonFile)) {
          for (var i = 0; i < models.length; i++) {
            if (file.indexOf(models[i].prefix) > -1) {
              logger.debug('%s file: %s', models[i].name, file);
              models[i].files.push(file);
              break;
            }
          }
        }
      }
    );
    // populate data-store models with the file contents
    populateModelsWithAPImData(app, models, dir, uid, cb);
  } else {
    var YAMLfiles = [];
    logger.debug('dir: ', dir);

    //read the apic settings
    var cfg = readApicConfig(dir);

    //read the YAML files
    project.loadProject(dir).then(function(artifacts) {
      logger.debug('%j', artifacts);
      artifacts.forEach(
        function(artifact) {
          if (artifact.type === 'swagger') {
            YAMLfiles.push(artifact.filePath);
          }
        });

      // populate data-store models with the file contents
      populateModelsWithLocalData(app, YAMLfiles, cfg, dir, uid, cb);
    });
  }
}

/*
function createProductID(product) {
  return (product.info.name + ':' + product.info.version);
}
*/

function createAPIID(api) {
  return (api.info['x-ibm-name'] + ':' + api.info.version);
}

/**
 * Populates data-store models with persisted content
 * @param {???} app - loopback application
 * @param {Array} YAMLfiles - list of yaml files to process (should only be swagger)
 * @param {Object} apicCfg - the APIC config object
 * @param {string} dir - path to directory containing persisted data to load
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateModelsWithLocalData(app, YAMLfiles, apicCfg, dir, uid, cb) {
  logger.debug('populateModelsWithLocalData entry');

  //default organization
  var defaultOrg = {
    id: 'defaultOrgID',
    name: 'defaultOrgName',
    title: 'defaultOrgTitle' };

  //default catalog
  var defaultCatalog = {
    id: 'defaultCatalogID',
    name: 'defaultCatalogName',
    title: 'defaultCatalogTitle' };
  defaultCatalog.organization = defaultOrg;

  //the apis
  var apis = {};

  async.series([
    // 1. create the "api" instances
    function(seriesCallback) {
      async.forEach(YAMLfiles,
        function(file, fileCallback) {
          logger.debug('Loading data from %s', file);
          var readfile;
          try {
            // read the content of the files into memory and parse as JSON
            readfile = YAML.load(file);

          } catch (e) {
            fileCallback(e);
            return;
          }
          var model = {};
          var entry = {};
          // looks like a product
          if (readfile.product) {
            logger.debug('product found: skipping');
          }
          // looks like an API
          if (readfile.swagger) {
            entry.id = createAPIID(readfile);
            entry.document = expandAPIData(readfile, dir);
            if (entry.document) {
              model.name = 'api';
              if (entry.document.info['x-ibm-name']) {
                apis[entry.document.info['x-ibm-name']] = entry.document;
              } else {
                apis[entry.document.info['title']] = entry.document;
              }
            }
          }

          if (model.name) {
            // no catalog
            entry.catalog = {};
            entry['snapshot-id'] = uid;
            app.models[model.name].create(
              entry,
              function(err, mymodel) {
                if (err) {
                  logger.error(err);
                  fileCallback(err);
                  return;
                }
                logger.debug('%s created: %j', model.name, mymodel);
                fileCallback();
              });
          } else {
            fileCallback();
          }
        },
        function(err) {
          if (err) { /* suppress eslint handle-callback-err */ }
        }
      );
      seriesCallback();
    },
    // 2. create the "catalog" instances
    function(seriesCallback) {
      defaultCatalog['snapshot-id'] = uid;
      app.models['catalog'].create(
        defaultCatalog,
        function(err, mymodel) {
          if (err) {
            logger.error(err);
            seriesCallback(err);
            return;
          }
          logger.debug('%s created: %j', 'catalog', mymodel);
          seriesCallback();
        });
    },
    // 3. create one "product" with all the apis defined
    function(seriesCallback) {
      var entry = {};
      // add catalog
      entry.catalog = defaultCatalog;
      entry['snapshot-id'] = uid;

      entry.document = {
        product: '1.0.0',
        info: {
          name: 'static-product',
          version: '1.0.0',
          title: 'static-product' },
        visibility: {
          view: {
            type: 'public' },
          subscribe: {
            type: 'authenticated' } },
        apis: apis };

      var rateLimit = '100/hour';
      if (process.env[LAPTOP_RATELIMIT]) {
        rateLimit = process.env[LAPTOP_RATELIMIT];
      }

      if (apicCfg && apicCfg.plans && apicCfg.applications) {
        //add the configured plans
        entry.document.plans = {};
        //add plan and its APIs
        for (var p in apicCfg.plans) {
          var plan = apicCfg.plans[p];
          if (typeof plan === 'object') {
            var planApis = {};
            for (var i in plan.apis) {
              var name = plan.apis[i];
              //add the api to plan if only if the api does exist
              if (apis[name]) {
                planApis[name] = {};
              } else {
                logger.warn('Cannot add the invalid api "%s" to plan "%s"',
                        name, p);
              }
            }
            entry.document.plans[p] = {
              apis: planApis,
              'rate-limit': {
                value: plan['rate-limit'] || rateLimit,
                'hard-limit': plan['hard-limit'] } };
          }
        }
      } else {
        //the default plan
        entry.document.plans = {
          default: {
            apis: apis,
            'rate-limit': {
              value: rateLimit,
              'hard-limit': true } } };
      }

      if (logger.debug()) {
        logger.debug('creating static product and attaching apis to plans: %s',
                JSON.stringify(entry, null, 2));
      }

      app.models.product.create(
        entry,
        function(err, mymodel) {
          if (err) {
            logger.error(err);
            seriesCallback(err);
            return;
          }
          logger.debug('%s created: %j', 'product', mymodel);
          seriesCallback();
        });
    },
    // 4. create the "subscriptions" instances
    function(seriesCallback) {
      var subscriptions = [];
      if (apicCfg && apicCfg.plans && apicCfg.applications) {
        //add the configured plans
        var idx = 0;
        for (var k in apicCfg.applications) {
          var theApp = apicCfg.applications[k];
          //An application can subscribe only one plan in a given product. Since
          //we have only one product defined for local data, the subscription of
          //an app should be a string instead of array!
          if (theApp && (!theApp.subscription || typeof theApp.subscription !== 'string')) {
            logger.warn('The app "%s" does not subscribe a plan?', k);
          } else if (typeof theApp === 'object') {
            subscriptions[idx] = {
              'snapshot-id': uid,
              organization: defaultOrg,
              'developer-organization': defaultOrg,
              catalog: defaultCatalog,
              id: 'defaultSubsID-' + k + '-static-product',
              application: {
                id: 'defaultAppID-' + k,
                title: 'defaultAppTitle-' + idx,
                'oauth-redirection-uri': (theApp['oauth-redirection-uri'] || 'https://localhost'),
                'app-credentials': [ {
                  'client-id': k,
                  'client-secret': (theApp['client-secret'] || 'dummy') } ] },
              'plan-registration': {
                id: ('static-product:1.0.0:' + theApp.subscription) } };
          }
          idx++;
        }
      } else {
        //the default subscription
        subscriptions[0] = {
          'snapshot-id': uid,
          organization: defaultOrg,
          'developer-organization': defaultOrg,
          catalog: defaultCatalog,
          id: 'defaultSubsID',
          application: {
            id: 'defaultAppID',
            title: 'defaultAppTitle',
            'oauth-redirection-uri': 'https://localhost',
            'app-credentials': [ {
              'client-id': 'default',
              'client-secret': 'CRexOpCRkV1UtjNvRZCVOczkUrNmGyHzhkGKJXiDswo=' } ] },
          'plan-registration': {
            id: 'ALLPLANS' } };
      }

      async.forEach(
        subscriptions,
        function(subscription, subsCallback) {
          var modelname = 'subscription';
          app.models[modelname].create(
            subscription,
            function(err, mymodel) {
              if (err) {
                logger.error(err);
                subsCallback(err);
                return;
              }
              logger.debug('%s created: %j', modelname, mymodel);
              subsCallback();
            });
        });
      seriesCallback();
    },

    // 5. create the "tls-profile" instances
    function(seriesCallback) {
      var modelname = 'tlsprofile';
      async.forEachOf(
        apicCfg['tls-profiles'],
        function(profile, name, asyncCB) {
          var instance = {
            'snapshot-id': uid,
            'org-id': defaultOrg.id,
            id: 'defaultTlsProfile-' + name,
            name: name,
            public: false,
            ciphers: [
              'SSL_RSA_WITH_AES_256_CBC_SHA',
              'SSL_RSA_WITH_AES_128_CBC_SHA',
              'SSL_RSA_WITH_3DES_EDE_CBC_SHA',
              'SSL_RSA_WITH_RCA_128_SHA',
              'SSL_RSA_WITH_RCA_128_MD5' ],
            protocols: [ 'TLSv11', 'TLSv12' ],
            certs: [],
            'mutual-auth': false };

          if (profile.rejectUnauthorized === true) {
            instance['mutual-auth'] = true;
          }

          if (Array.isArray(profile.secureProtocols)) {
            instance.protocols = [];
            profile.secureProtocols.forEach(function(protocol) {
              switch (protocol) {
                case 'TLSv1_method':
                  instance.protocols.push('TLSv1');
                  break;
                case 'TLSv1_1_method':
                  instance.protocols.push('TLSv11');
                  break;
                case 'TLSv1_2_method':
                  instance.protocols.push('TLSv12');
                  break;
              }
            });
          }

          if (typeof profile.key === 'object') {
            instance['private-key'] = profile.key.content;
          }

          if (typeof profile.cert === 'object') {
            instance.certs.push({
              name: profile.cert.name,
              cert: profile.cert.content,
              'cert-type': 'INTERMEDIATE',
              'cert-id': name + '-cert-' + profile.cert.name });
          }

          if (Array.isArray(profile.ca)) {
            profile.ca.forEach(function(ca) {
              if (typeof ca === 'object') {
                instance.certs.push({
                  name: ca.name,
                  cert: ca.content,
                  'cert-type': 'CLIENT',
                  'cert-id': name + '-ca-cert-' + ca.name });
              }
            });
          }

          app.models[modelname].create(
            instance,
            function(err, mymodel) {
              if (err) {
                logger.error('Failed to populate a tls-profile:', err);
              } else {
                logger.debug('%s created: %j', modelname, mymodel);
              }
              asyncCB();
            });
        });

      seriesCallback();
    } ],
    function(err) { cb(err); });
}

function findAndReplace(object, value, replacevalue) {
  for (var x in object) {
    if (typeof object[x] === 'object') {
      findAndReplace(object[x], value, replacevalue);
    }
    if (typeof object[x] === 'string' && object[x].indexOf(value) > -1) {
      logger.debug('found variable to replace: ', value, ' with ', replacevalue);
      object[x] = object[x].replace(value, replacevalue);
    }
  }
  return object;
}

function checkHttps(apidoc) {
  // determine if micro gateway should start w/ HTTPS or not
  // based on presence of 'https' in schemes
  if (!https || !http) {
    if (apidoc.schemes) {
      if (apidoc.schemes.indexOf('https') > -1) {
        https = true;
      }
      if (apidoc.schemes.indexOf('http') > -1) {
        http = true;
      }
    } else {
      https = true;
    }
  }
  if (http && https) {
    logger.error('Both HTTP and HTTPS schemes detected; Gateway only supports a single protocol at a time');
    mixedProtocols = true;
  }
}

function expandAPIData(apidoc, dir) {
  if (apidoc['x-ibm-configuration']) {
    // add the assembly
    if (apidoc['x-ibm-configuration'].assembly &&
        apidoc['x-ibm-configuration'].assembly['$ref']) {
      var assemblyFile = path.join(dir,
              apidoc['x-ibm-configuration'].assembly['$ref']);
      var assembly = YAML.load(assemblyFile);
      apidoc['x-ibm-configuration'].assembly = assembly;
    }

    // fill in apid-dev properties
    if (apidoc['x-ibm-configuration'].catalogs) {
      if (apidoc['x-ibm-configuration'].catalogs['apic-dev']) {
        var props = Object.getOwnPropertyNames(
                apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties);
        props.forEach(function(property) {
          logger.debug('property: ', property);
          var propertyvalue = '$(' + property + ')';
          logger.debug('propertyvalue: ', propertyvalue);
          var replacementvalue;
          // is it an environment var?? $(envVar)
          var regEx = /\$\((.*)\)/;
          var matches = apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties[property].match(regEx);
          var envvar = matches[1];
          if (envvar) {
            if (!process.env[envvar]) {
              logger.debug('Environment Variable not set for :', envvar);
            }
            replacementvalue = process.env[envvar];
          } else { // just replace all the values straight up
            replacementvalue = apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties[property];
          }
          apidoc = findAndReplace(apidoc, propertyvalue, replacementvalue);
        });
      }
    }

    // fill in catalog properties (one off for now until we have the scope of other vars required)
    var cataloghost = 'localhost:' + process.env.PORT;
    var cataloghostvar = '$(catalog.host)';
    if (process.env.CATALOG_HOST) {
      cataloghost = process.env.CATALOG_HOST;
    }
    apidoc = findAndReplace(apidoc, cataloghostvar, cataloghost);
  }
  checkHttps(apidoc);
  if (!checkSecurity(apidoc)) {
    return null;
  }
  return apidoc;
}

/**
 * Read the APIC config files, apic.json and apic-tls-profiles.json under the
 * given directory. (Check test/definitions/apic-config/*.json for example)
 *
 * @param {string} dir - path to directory containing persisted data to load
 * @return the parsed config
 *   { "applications": { }, "plans": { }, "tls-profiles": { } }
 */
function readApicConfig(dir) {
  var cfg = {};

  var filename;
  var parsed;
  //read the apic.json
  try {
    filename = path.join(dir, 'apic.json');
    if (fs.existsSync(filename)) {
      parsed = JSON.parse(fs.readFileSync(filename));
      cfg.applications = parsed.applications || {};
      cfg.plans = parsed.plans || {};

      //post-process: caculate the hash value of the client secret in apic.json
      for (var a in cfg.applications) {
        var app = cfg.applications[a];
        if (typeof app === 'object') {
          var plain_secret = app['client-secret'];
          if (typeof plain_secret === 'string') {
            var hash = Crypto.createHash('sha256').update(plain_secret).digest('base64');
            app['client-secret'] = hash;
          }
        }
      }
    }
  } catch (e1) {
    logger.warn('Failed to read/parse apic.json:', e1);
  }

  //read the apic-tls-profiles.json
  try {
    filename = path.join(dir, 'apic-tls-profiles.json');
    if (fs.existsSync(filename)) {
      parsed = JSON.parse(fs.readFileSync(filename));
      cfg['tls-profiles'] = parsed || {};

      //post-process: read the key and cert file contents
      for (var p in cfg['tls-profiles']) {
        var profile = cfg['tls-profiles'][p];
        if (typeof profile === 'object') {
          if (profile.key && typeof profile.key === 'string') {
            try {
              profile.key = path.resolve(dir, profile.key);
              profile.key = {
                name: profile.key,
                content: fs.readFileSync(profile.key) };
            } catch (e) {
              logger.warn('Failed to read the key file "%s":', profile.key, e);
            }
          }
          if (profile.cert && typeof profile.cert === 'string') {
            try {
              profile.cert = path.resolve(dir, profile.cert);
              profile.cert = {
                name: profile.cert,
                content: fs.readFileSync(profile.cert) };
            } catch (e) {
              logger.warn('Failed to read the cert file "%s":', profile.cert, e);
            }
          }
          if (Array.isArray(profile.ca)) { //ca is an array
            for (var q in profile.ca) {
              try {
                var ca = profile.ca[q];
                ca = path.resolve(dir, ca);
                ca = fs.readFileSync(ca);
                profile.ca[q] = {
                  name: profile.ca[q],
                  content: ca };
              } catch (e) {
                logger.warn('Failed to read the ca file "%s":', ca, e);
              }
            }
          } else {
            profile.ca = [];
          }
        }
      }
    }
  } catch (e2) {
    logger.warn('Failed to read/parse apic-tls-profiles.json:', e2);
  }

  return cfg;
}


/*
function loadAPIsFromYAML(listOfAPIs, dir) {
  var apis = [];
  //var summaryAPIs = [];
  for (var i = 0; i < listOfAPIs.length; i++) {
    var apiFile = path.join(dir, listOfAPIs[i]['$ref']);
    var api;
    try {
      api = YAML.load(apiFile);
    } catch (e) {
      logger.debug('Load failed of: ', apiFile);
      api = YAML.load(apiFile + '.yaml');
    }
    //scope data down
    //var summary = {id: createAPIID(api),info: api.info};
    //summaryAPIs.push(summary);
    apis.push(api);
  }
  //return summaryAPIs;
  return apis;
}
*/

/**
 * Populates data-store models with persisted content
 * @param {???} app - loopback application
 * @param {Array} models - instances of ModelType to populate with data
 * @param {string} dir - path to directory containing persisted data to load
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateModelsWithAPImData(app, models, dir, uid, cb) {
  logger.debug('populateModelsWithAPImData entry');
  async.forEach(models,
    function(model, modelCallback) {
      async.forEach(model.files,
        function(typefile, fileCallback) {
          var file = path.join(dir, typefile);
          logger.debug('Loading data from %s', file);
          var readfile;
          try {
            // read the content of the files into memory
            // and parse as JSON
            readfile = JSON.parse(apimdecrypt(fs.readFileSync(file)));
          } catch (e) {
            fileCallback(e);
            return;
          }
          logger.debug('filecontents: ', readfile);
          // inject 'snapshot-id' property
          var valid = [];
          readfile.forEach(
            function(obj) {
              obj['snapshot-id'] = uid;

              // looks like an API
              if (obj.document && obj.document.swagger) {
                checkHttps(obj.document);
                if (checkSecurity(obj.document)) {
                  valid.push(obj);
                }
              } else {
                valid.push(obj);
              }
            });

          app.models[model.name].create(
            valid,
            function(err, mymodel) {
              if (err) {
                fileCallback(err);
                return;
              }
              logger.debug('%s created: %j',
                    model.name,
                    mymodel);
              fileCallback();
            });
        },
        function(err) {
          modelCallback(err);
        });
    },
    function(err) {
      logger.debug('populateModelsWithAPImData exit');
      cb(err);
    });
}

/**
 * Initializes new snapshot instance in snapshot model
 * @param {???} app - loopback application
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateSnapshot(app, uid, cb) {
  logger.debug('populateSnapshot entry');

  app.models.snapshot.create(
    { id: uid,
      refcount: '1',
      current: 'false' },
    function(err, mymodel) {
      if (err) {
        logger.error('populateSnapshot error');
        cb(err);
        return;
      }
      logger.debug('populateSnapshot exit: %j', mymodel);
      cb();
    });
}

/**
 * Releases reference on snapshot instance in snapshot model
 * @param {???} app - loopback application
 * @param {string} uid - snapshot identifier
 */
function releaseSnapshot(app, uid, cb) {
  logger.debug('releaseSnapshot entry');

  app.models.snapshot.release(uid,
    function(err) {
      if (err) {
        logger.error(err);
      }
      logger.debug('releaseSnapshot exit');
      if (cb) {
        cb(err);
      }
    });
}

/**
 * Updates snapshot instance in snapshot model to reflect 'current'
 * @param {???} app - loopback application
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or successful completion
 */
function updateSnapshot(app, uid, cb) {
  logger.debug('updateSnapshot entry');

  app.models.snapshot.findOne(
    { where: { current: 'true' } },
    function(err, instance) {
      if (err) {
        // fall through assuming there was no current
      } else if (instance) {
        instance.updateAttributes(
          { current: 'false' },
          function(err, instance) {
            if (err) {
              // fall through assuming instance was deleted
            }
          });
        releaseSnapshot(app, instance.id);
      }
    });

  app.models.snapshot.findById(uid, function(err, instance) {
    if (err) {
      logger.debug('updateSnapshot error(1)');
      cb(err);
      return;
    }

    instance.updateAttributes(
      { current: 'true' },
      function(err, instance) {
        if (err) {
          logger.debug('updateSnapshot error(2)');
          cb(err);
          return;
        }
        logger.debug('updateSnapshot exit');
        cb();
      });
  });
}

function triggerReload(app, ctx) {
  if (ctx.instance.webhook_id !== currentWebhook) {
    logger.warn('Received webhook ID %s does not match expected webhook ID %s',
                 ctx.instance.webhook_id, currentWebhook);
    return;
  }
  logger.debug('Received webhook ID %s matches expected webhook ID %s',
               ctx.instance.webhook_id, currentWebhook);
  loadData(app, apimanager, models, false);
}

module.exports.triggerReloadFromWebhook = triggerReload;
