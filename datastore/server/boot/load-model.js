// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var fs = require('fs');
var path = require('path');
var async = require('async');
var YAML = require('yamljs');
var constants = require('constants');
var Crypto = require('crypto');
var Request = require('request');
var url = require('url');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:datastore:server:boot:load-model'});
var sgwapimpull = require('../../apim-pull');
var apimpull = sgwapimpull.pull;
var apimdecrypt = sgwapimpull.decrypt;
var environment = require('../../../utils/environment');
var APIMANAGER = environment.APIMANAGER;
var APIMANAGER_PORT = environment.APIMANAGER_PORT;
var APIMANAGER_CATALOG = environment.APIMANAGER_CATALOG;
var CONFIGDIR = environment.CONFIGDIR;
var KEYNAME = environment.KEYNAME;

var LAPTOP_RATELIMIT = environment.LAPTOP_RATELIMIT;
var CATALOG_HOST = environment.CATALOG_HOST;

var cliConfig = require('apiconnect-cli-config');

var rootConfigPath = __dirname + '/../../../config/';
var definitionsDir = rootConfigPath + 'default';

var gatewayMain = __dirname + '/../../../';
var keyFile = gatewayMain + KEYNAME;
var version ='1.0.0';
var mixedProtocols = http = https = false;

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
  var models = [];
  models.push(new ModelType('catalog', 'catalogs-'));
  models.push(new ModelType('api', 'apis-'));
  models.push(new ModelType('product', 'products-'));
  models.push(new ModelType('subscription', 'subs-'));
  models.push(new ModelType('tlsprofile', 'tlsprofs-'));
  models.push(new ModelType('registry', 'registries-'));
  // add new models above this line
  models.push(new ModelType('optimizedData', 'dummy'));
  models.push(new ModelType('snapshot', 'dummy')); // hack, removed later

  var refreshInterval = 15 * 60 * 1000; // 15 minutes
  if (process.env.APIMANAGER_REFRESH_INTERVAL) {
    refreshInterval = process.env.APIMANAGER_REFRESH_INTERVAL;
  } 
  var apimanager = {
    host: process.env[APIMANAGER],
    port: process.env[APIMANAGER_PORT],
    catalog: process.env[APIMANAGER_CATALOG],
    handshakeOk: false,
    refresh : refreshInterval
    };

  async.series(
    [
      function(callback) {
        // get CONFIG_DIR.. two basic paths APIm load or local
        // if no ENV var, load default dir.. APIm 
        // if ENV var, 
        //    if apimanager specified, dir = 'last known config'..
        //    if no apimanager specified, dir will be loaded..
        if (process.env[CONFIGDIR])
          definitionsDir = process.env[CONFIGDIR];
        process.env.ROOTCONFIGDIR = path.dirname(definitionsDir);
        callback();
      },
      // stage the models
      function(callback) {
        stageModels(app, models, function(err) {
            models.pop(); // remove snapshot model
            models.pop(); // remove optimizedData model
            callback(err);
          }
       );
      },
      function (callback) {
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
        handshakeWithAPIm(app, apimanager, private_key, function (err) {
          callback(); // TODO: treat as error
          //don't treat as error currently because UT depends on this
        });
      }
    ],
    // load the data into the models
    function(err) {
      if (!err) {
        loadData(app,
                 apimanager,
                 models,
                 definitionsDir);
      }
    }
  );
};

/**
 * Loads the data into models, and periodically refreshes the data
 * @param {???} app - loopback application
 * @param {Object} config - configuration pointing to APIm server
 * @param {Array} models - instances of ModelType to populate with data
 * @param {string} currdir - current snapshot symbolic link path 
 */
function loadData(app, apimanager, models, currdir) {
  var snapdir;
  var snapshotID = getSnapshotID();
  var populatedSnapshot = false;
  
  async.series(
    [
      function(callback) {
        logger.debug('apimanager before pullFromAPIm: %j', apimanager);
        if (apimanager.host) {
            // && apimanager.handshakeOk << shouldn't call if handshake failed.. not ready #TODO
            // don't look for successful handshake currently because UT depends on this
          // we have an APIm, handshake succeeded, so try to pull data..
          pullFromAPIm(apimanager, snapshotID, function(err, dir) {
            snapdir = dir; // even in case of error, we need to try loading from the file system
            callback();
          });
        }
        else {
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
      }
    ],
    function(err, results) {
      if (err) {
        if (populatedSnapshot) {
          releaseSnapshot(app, snapshotID, function (err) {
            process.send({LOADED:false});
          });
        } else
          process.send({LOADED:false});
      } else {
        // neither http nor https would be set if there were no APIs
        // defined; if no APIs defined, let's try again in a while
        if (!apimanager.host || http || https)
          process.send({LOADED: true, 'https': https});
      }
      setImmediate(scheduleLoadData,
                   app,
                   apimanager,
                   models,
                   currdir);
    }
  );
}

function scheduleLoadData(app, apimanager, models, dir) {
  if (apimanager.host)
    setTimeout(loadData,
             apimanager.refresh,
             app,
             apimanager,
             models,
             dir);
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
  var sign = function (str, private_key) {
    var sign = Crypto.createSign('RSA-SHA256');
    sign.update(str);
    return sign.sign(private_key, 'base64');
  };

  var sha256 = function (str, encoding) {
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


  var combine = function (names, headers) {
    var parts = [];
    names.forEach(function (e) {
      parts.push(e + ": " + headers[e]);
    });
    return parts.join("\n");
  };

  headers.authorization = 'Signature ' +
    'keyId="' + keyId + '", ' +
    'headers="date digest", ' +
    'algorithm="rsa-sha256", ' +
    'signature="' + sign(combine(['date', 'digest'], headers), private_key) + '"';

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
    {
      key: private_key,
      padding: constants.RSA_PKCS1_PADDING
    },
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

      var body = JSON.stringify({
        gatewayVersion: version
      });

      var headers = {
        'content-type': 'application/json'
      };

      addSignatureHeaders(body, headers, "micro-gw-catalog/"+apimanager.catalog, private_key);

      if (logger.debug()) {
        logger.debug(JSON.stringify(headers, null, 2));
      }

      var apimHandshakeUrlObj = {
        protocol: 'https',
        hostname: apimanager.host,
        port: apimanager.port,
        pathname: '/v1/catalogs/' + apimanager.catalog + '/handshake/'
      };
      var apimHandshakeUrl = url.format(apimHandshakeUrlObj);
      
      Request({
        url: apimHandshakeUrl,
        method: 'POST',
        json: body,
        headers: headers,
        agentOptions: {
          rejectUnauthorized: false //FIXME: need to eventually remove this
          }
        },       
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
//        sensitive data
//        if (logger.debug()) {
//          logger.debug(JSON.stringify(json, null, 2));
//        }

        if (!json.microGateway) {
          return callback(new Error(apimHandshakeUrl + ' response did not contain "microGateway" section'));
        }

        var ugw = json.microGateway;
        apimanager.clicert = ugw.cert;
        apimanager.clikey = ugw.key;
        apimanager.clientid = ugw.clientID;

//        sensitive data
//        if (logger.debug()) {
//          logger.debug('apimanager: %s', JSON.stringify(apimanager, null, 2));
//        }
        callback(null);
        });
      }],
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
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or path to
 *                        snapshot directory
 */
function pullFromAPIm(apimanager, uid, cb) {
  logger.debug('pullFromAPIm entry');
  // Have an APIm, grab latest if we can..
  var snapdir =  process.env.ROOTCONFIGDIR +
                  '/' +
                  uid +
                  '/';
  fs.mkdir(snapdir, function(err) {
      if (err) {
        logger.warn('Failed to create snapshot directory');
        logger.debug('pullFromAPIm exit(1)');
        cb(null, '');
        return;
      }
      /*
      var options = {
        host : host of APIm
        port : port of APIm
        timeout : opts.timeout * 1000 || 30 * 1000,
        clikey : opts.clikey ? opts.clikey : null,
        clicert : opts.clicert ? opts.clicert  : null,
        clientid : opts.clientid || '1111-1111',
        outdir : opts.outdir || 'apim'
      };*/

      var options = {};
      options.host = apimanager.host;
      options.port = apimanager.port;
      options.clikey = apimanager.clikey;
      options.clicert = apimanager.clicert;
      options.clientid = apimanager.clientid;
      options.outdir = snapdir;
      logger.debug('apimpull start');
      apimpull(options,function(err, response) {
          if (err) {
            logger.error(err);
            try {
              fs.rmdirSync(snapdir);
            } catch(e) {
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
          cb(null, snapdir);
        }
      );
    }
  );
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

  var dirToLoad = (snapdir === '') ?
                    (currdir + '/') :
                    snapdir;
  loadConfigFromFS(app, apimanager, models, dirToLoad, uid, function(err) {
      if (err) {
        logger.error(err);
        logger.debug('loadConfig error(1)');
        cb(err);
        return;
      }
      else if (mixedProtocols){
        logger.debug('loadConfig error(2)');
        cb(new Error('mixed protocols'));
        return;
      }
      else {
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
            }
            logger.debug('loadConfig exit');
            cb();
          }
        );
      }
    }
  );
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
    var files;
    logger.debug('loadConfigFromFS entry');
    try {
      files = fs.readdirSync(dir);
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
          for(var i = 0; i < models.length; i++) {
            if(file.indexOf(models[i].prefix) > -1) {
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
  }
  else {
    var YAMLfiles = [];
    logger.debug('dir: ', dir );
    cliConfig.loadProject(dir).then(function(artifacts) { 
      logger.debug('%j', artifacts); 
      artifacts.forEach(
        function(artifact) {
          if (artifact.type === 'swagger') {
            YAMLfiles.push(artifact.filePath);
          }
        });
      // populate data-store models with the file contents
      populateModelsWithLocalData(app, YAMLfiles, dir, uid, cb);
    });
  }
}

function createProductID(product) {
  return (product.info.name + ':' + product.info.version);
}
  
function createAPIID(api) {
  return (api.info['x-ibm-name'] + ':' + api.info.version);
}

/**
 * Populates data-store models with persisted content
 * @param {???} app - loopback application
 * @param {Array} YAMLfiles - list of yaml files to process (should only be swagger)
 * @param {string} dir - path to directory containing persisted data to load
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateModelsWithLocalData(app, YAMLfiles, dir, uid, cb) {
  logger.debug('populateModelsWithLocalData entry');
  var apis = {};
  var subscriptions = [
            {
            'organization': {
              'id': 'defaultOrgID',
              'name': 'defaultOrgName',
              'title': 'defaultOrgTitle'
            },
            'catalog': {
              'id': 'defaultCatalogID',
              'name': 'defaultCatalogName',
              'title': 'defaultCatalogTitle'
            },
            'id': 'defaultSubsID',
            'application': {
              'id': 'defaultAppID',
              'title': 'defaultAppTitle',
              'oauth-redirection-uri': 'https://localhost',
              'app-credentials': [{
                'client-id': 'default',
                'client-secret': 'CRexOpCRkV1UtjNvRZCVOczkUrNmGyHzhkGKJXiDswo='
              }]
            },
            'developer-organization': {
              'id': 'defaultOrgID',
              'name': 'defaultOrgName',
              'title': 'defaultOrgTitle'
            },
            'plan-registration': {
              'id': 'ALLPLANS'
                }
            }
            ];
  var catalog = subscriptions[0].catalog;
  catalog.organization = subscriptions[0].organization;
  async.series([
    function(seriesCallback) {
      async.forEach(YAMLfiles,
          function(file, fileCallback) {
            logger.debug('Loading data from %s', file);
            var readfile;
            try {
              // read the content of the files into memory
              // and parse as JSON
              readfile = YAML.load(file);
    
            } catch(e) {
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
              model.name = 'api';
              entry.id = createAPIID(readfile);
              entry.document = expandAPIData(readfile, dir);
              apis[entry.document.info['x-ibm-name']] = entry.document;
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
                  logger.debug('%s created: %j',
                        model.name,
                        mymodel);
                  fileCallback();
                }
              );
            }
            else {
              fileCallback();
            }
          },
          function(err) {  }
      ); 
      seriesCallback();
    },
    function(seriesCallback) {
        catalog['snapshot-id'] = uid;
        app.models['catalog'].create(
          catalog,
          function(err, mymodel) {
            if (err) {
              logger.error(err);
              seriesCallback(err);
              return;
            }
            logger.debug('%s created: %j',
                  'catalog',
                  mymodel);
          seriesCallback();
          }
        );
    },
    // create product with all the apis defined
    function(seriesCallback) {
        var entry = {};
        // add catalog
        entry.catalog = catalog;
        entry['snapshot-id'] = uid;
        var rateLimit = '100/hour';
        if (process.env[LAPTOP_RATELIMIT])
          {rateLimit=process.env[LAPTOP_RATELIMIT];}
        entry.document = 
          {
          'product': '1.0.0',
          'info': {
            'name': 'static product',
            'version': '1.0.0',
            'title': 'static-product'
          },
          'visibility': {
            'view': {
              'type': 'public'
            },
            'subscribe': {
              'type': 'authenticated'
            }
          },
          'apis': apis,
          'plans': {
            'default': {
              'apis': apis,
              'rate-limit': {
              'value': rateLimit,
              'hard-limit': true
              }
            }
          }
        };
        if (logger.debug()) {
          logger.debug('creating static product and attaching apis: %s',
            JSON.stringify(entry, null, 4));
        }

        app.models.product.create(
          entry,
          function(err, mymodel) {
            if (err) {
              logger.error(err);
              seriesCallback(err);
              return;
            }
            logger.debug('%s created: %j',
                  'product',
                  mymodel);
          seriesCallback();
          }
        );
      },
    // Hardcode default subscription for all plans
    function(seriesCallback) {
        async.forEach(subscriptions,
          function(subscription, subsCallback) 
            {
            var modelname = 'subscription';
            subscription['snapshot-id'] = uid;
            app.models[modelname].create(
              subscription,
              function(err, mymodel) {
                if (err) {
                  logger.error(err);
                  subsCallback(err);
                  return;
                }
                logger.debug('%s created: %j',
                      modelname,
                      mymodel);
                subsCallback();
              }
            );
          });
        seriesCallback();
    }],
    function (err)
      {
      cb(err);
      }
    );
}

function findAndReplace(object, value, replacevalue){
  for(var x in object){
    if(typeof object[x] == 'object'){
      findAndReplace(object[x], value, replacevalue);
    }
    if(typeof object[x] === 'string' && object[x].indexOf(value) > -1){ 
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

function expandAPIData(apidoc, dir)
  {
  if (apidoc['x-ibm-configuration'])
    {
    // add the assembly
    if (apidoc['x-ibm-configuration'].assembly && 
      apidoc['x-ibm-configuration'].assembly['$ref']) {
      var assemblyFile = path.join(dir, 
        apidoc['x-ibm-configuration'].assembly['$ref']);
      var assembly = YAML.load(assemblyFile);
      apidoc['x-ibm-configuration'].assembly = assembly;
      }
    // fill in apid-dev properties
    if (apidoc['x-ibm-configuration'].catalogs)
      {
      if (apidoc['x-ibm-configuration'].catalogs['apic-dev'])
      Object.getOwnPropertyNames(apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties).forEach(
        function (property) 
          {
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
            }
          // just replace all the values straight up
          else {
            replacementvalue = apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties[property];
            }
            apidoc = findAndReplace(apidoc, propertyvalue, replacementvalue);
            });
      }
    // fill in catalog properties (one off for now until we have the scope of other vars required)
    var cataloghost = 'localhost:' + process.env.PORT;
    var cataloghostvar = '$(catalog.host)';
    if (process.env.CATALOG_HOST) {
      cataloghost= process.env.CATALOG_HOST;
      }
    apidoc = findAndReplace(apidoc, cataloghostvar, cataloghost);
    }
  checkHttps(apidoc);
  return apidoc;
  }
function loadAPIsFromYAML(listOfAPIs, dir)
  {
  var apis = [];
  //var summaryAPIs = [];
  for(var i = 0; i < listOfAPIs.length; i++) {
    var apiFile = path.join(dir, 
                            listOfAPIs[i]['$ref']);
    var api;
    try {
      api = YAML.load(apiFile);
    } catch(e) {
      logger.debug('Load failed of: ', apiFile);
      api = YAML.load(apiFile+'.yaml');
    }
    //scope data down
    //var summary = {id: createAPIID(api),info: api.info};
    //summaryAPIs.push(summary);
    apis.push(api);
    }
  //return summaryAPIs;
  return apis;
  }
  

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
          } catch(e) {
            fileCallback(e);
            return;
          }
          logger.debug('filecontents: ', readfile);
          // inject 'snapshot-id' property
          readfile.forEach(
            function(obj) {
              obj['snapshot-id'] = uid;

              // looks like an API
              if (obj.document && obj.document.swagger) {
                checkHttps(obj.document);
              }
            }
          );

          app.models[model.name].create(
            readfile,
            function(err, mymodel) {
              if (err) {
                fileCallback(err);
                return;
              }
              logger.debug('%s created: %j',
                    model.name,
                    mymodel);
              fileCallback();
            }
          );
        },
        function(err) {
          modelCallback(err);
        }
      );
    },
    function(err) {
      logger.debug('populateModelsWithAPImData exit');
      cb(err);
    }
  ); 
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
    {
      'id': uid,
      'refcount': '1',
      'current' : 'false'
    },
    function(err, mymodel) {
      if (err) {
        logger.error('populateSnapshot error');
        cb(err);
        return;
      }
      logger.debug('populateSnapshot exit: %j', mymodel);
      cb();
    }
  );
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
      if (err) logger.error(err);
      logger.debug('releaseSnapshot exit');
      if (cb) cb(err);
    }
  );
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
    {
      'where' :
        {
          'current' : 'true'
        }
    },
    function(err, instance) {
      if (err) {
        // fall through assuming there was no current
      } else if (instance) {
        instance.updateAttributes(
          {'current' : 'false' },
          function(err, instance) {
            if (err) {
              // fall through assuming instance was deleted
            }
          }
        );
        releaseSnapshot(app, instance.id);
      }
    }
  );
  app.models.snapshot.findById(uid, function(err, instance) {
      if (err) {
        logger.debug('updateSnapshot error(1)');
        cb(err);
        return;
      }

      instance.updateAttributes(
        {
          'current' : 'true'
        },
        function(err, instance) {
          if (err) {
            logger.debug('updateSnapshot error(2)');
            cb(err);
            return;
          }
          logger.debug('updateSnapshot exit');
          cb();
        }
      );
    }
  );
}
