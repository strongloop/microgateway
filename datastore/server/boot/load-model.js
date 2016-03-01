var fs = require('fs');
var path = require('path');
var async = require('async');
var YAML = require('yamljs');
var constants = require('constants');
var Crypto = require('crypto');
var Request = require('request');
var debug = require('debug')('micro-gateway:data-store');
var sgwapimpull = require('../../apim-pull');
var apimpull = sgwapimpull.pull;
var environment = require('../../../utils/environment');
var APIMANAGER = environment.APIMANAGER;
var APIMANAGER_PORT = environment.APIMANAGER_PORT;
var APIMANAGER_CATALOG = environment.APIMANAGER_CATALOG;
var CONFIGDIR = environment.CONFIGDIR;

var LAPTOP_RATELIMIT = environment.LAPTOP_RATELIMIT;

var cliConfig = require('apiconnect-cli-config');

var rootConfigPath = __dirname + '/../../../config/';
var defaultDefinitionsDir = rootConfigPath + 'default';
var definitionsDir = defaultDefinitionsDir;

var keyDir = __dirname + '/../../../';
var keyFile = keyDir + 'id_rsa';
var version ='1.0.0';

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

  var apimanager = {
    host: process.env[APIMANAGER],
    port: process.env[APIMANAGER_PORT],
    catalog: process.env[APIMANAGER_CATALOG],
    handshakeOk: false
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
        else {
          process.env['ROOTCONFIGDIR'] = rootConfigPath;
          definitionsDir = defaultDefinitionsDir;
        }
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
      function(callback) {
        // load key..
        var private_key = '';
        try {
          private_key = fs.readFileSync(keyFile,'utf8');
        } catch(e) {
          console.log('Can not load key: %s Error: %s', keyFile, e);
        }

        if (apimanager.host && apimanager.handshakeOk === false && private_key) {
        // we have an APIm, and a key so try to handshake with it.. 
          handshakeWithAPIm(app, apimanager, function(err, handshakeApimanager) {
            apimanager = handshakeApimanager;
            callback(); // should return the error.. not ready #TODO
            })
          }
        else { callback();}       
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
  
  async.series(
    [
      function(callback) {
        debug('apimanager before pullFromAPIm: ' + JSON.stringify(apimanager))
        if (apimanager.host) { 
            // && apimanager.handshakeOk << shouldn't call if handshake failed.. not ready #TODO
        // we have an APIm, handshake succeeded, so try to pull data.. 
          pullFromAPIm(apimanager, snapshotID, function(err, dir) {
            snapdir = dir;
            callback();
          });
        }
        else {
          snapdir = '';
          callback();}
      },
      // populate snapshot model
      function(callback) {
        populateSnapshot(app, snapshotID, callback);
      },
      // load current config
      function(callback) {
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
             15 * 1000, // 15 seconds TODO: make configurable
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
  debug('stageModels entry');
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
      debug('stageModels exit');
      cb(err);
    }
  );
}
/**
 * Attempt to handshake from APIm server
 * @param {???} app - loopback application
 * @param {Object} config - configuration pointing to APIm server
 * @param {callback} cb - callback that handles error or path to
 *                        snapshot directory
 */
function handshakeWithAPIm(app, apimanager, cb) {
  debug('handshakeWithAPIm entry');
  
  async.series([
    function(callback) {
      // send version encrypted using public key

      var encryptedVersion = Crypto.privateEncrypt(private_key, new Buffer(version,'ascii'));
      var body = {
        gatewayVersion: encryptedVersion
      }
      debug('EncryptedBody:' + JSON.stringify(body));
          
      var apimHandshakeUrl = 'https://' + apimanager.host + ':' + apimanager.port + '/v1/catalogs/' + apimanager.catalog + '/handshake/';
      
      Request({
        url: apimHandshakeUrl,
        method: 'POST',
        json: body,
        headers: {
          'content-type': 'application/json'
          }
        },       
      function(err, res, body) {
        if (err) {
          debug('Failed to communicate with %s: %s ', apimHandshakeUrl, err);
          callback(err);
        }
        else {
          debug('statusCode: ' + res.statusCode);          
          if (res.statusCode === 200) {
            var algorithm = 'AES-256-CBC';
            var IV = '0000000000000000';
            debug('body: ' + JSON.stringify(res.body));
            var password = Crypto.privateDecrypt(private_key, new Buffer(res.body.Key));
            debug('password: ' + password);
            var decipher = Crypto.createDecipheriv(algorithm, password, IV);
            var decrypted = decipher.update(res.body.cipher, 'base64', 'utf8');
            decrypted += decipher.final('utf8');
            debug('decrypted: ' + decrypted);
            var jsonDecrypted = JSON.parse(decrypted);
            
            debug('jsonDecrypted: ' + JSON.stringify(jsonDecrypted));
            
            apimanager.clicert = jsonDecrypted.managerCert;
            apimanager.clikey = jsonDecrypted.managerKey;
            apimanager.clientid = jsonDecrypted.clientID;
            
            debug('apimanager.clicert: ' + apimanager.clicert);
            debug('apimanager.clikey: ' + apimanager.clikey);
            debug('apimanager.clientid: ' + apimanager.clientid);

            debug('apimanager: ' + JSON.stringify(apimanager));          
            callback(null, apimanager);
            }
          else {
            var error = new Error(apimHandshakeUrl +
                            ' failed with: ' +
                            res.statusCode);
            callback(error);
            }
          }
        });
      }],
    function(err) {
      if (err)
        apimanager.handshakeOk = false;
      else
        apimanager.handshakeOk = true;
      debug('handshakeWithAPIm exit');
      cb(err, apimanager);
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
  debug('pullFromAPIm entry');
  // Have an APIm, grab latest if we can..
  var snapdir =  rootConfigPath +
                  uid +
                  '/';
  fs.mkdir(snapdir, function(err) {
      if (err) {
        debug('pullFromAPIm exit(1)');
        cb(null, '');
        return;
      }
      /*
      var options = {
        host : host of APIm
        port : port of APIm
        timeout : opts.timeout * 1000 || 30 * 1000,
        clikey : opts.clikey ? fs.readFileSync(key) : null,
        clicert : opts.clicert ? fs.readFileSync(cert)  : null,
        clientid : opts.clientid || '1111-1111',
        outdir : opts.outdir || 'apim'
      };*/

      var options = {};
      options['host'] = apimanager.host;
      options['port'] = apimanager.port;
      options['clikey'] = apimanager.clikey;
      options['clicert'] = apimanager.clicert;
      options['clientid'] = apimanager.clientid;
      options['outdir'] = snapdir;
      debug('apimpull start');
      apimpull(options,function(err, response) {
          if (err) {
            console.error(err);
            try {
              fs.rmdirSync(snapdir);
            } catch(e) {
              console.error(e);
              //continue
            }
            snapdir = '';
            // falling through
            // try loading from local files
          }
          debug(response);
          debug('pullFromAPIm exit(2)');
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
  debug('loadConfig entry');

  var dirToLoad = (snapdir === '') ?
                    (currdir + '/') :
                    snapdir;
  loadConfigFromFS(app, apimanager, models, dirToLoad, uid, function(err) {
      if (err) {
        console.error(err);
        debug('loadConfig error(1)');
        cb(err);
        return;
      }
      else {
        // update current snapshot pointer
        updateSnapshot(app, uid, function(err) {
            if (err) {
              debug('loadConfig error(2)');
              cb(err);
              return;
            }
            process.send({LOADED: true});
            // only update pointer to latest configuration
            // when latest configuration successful loaded
            if (snapdir === dirToLoad) {
                process.env[CONFIGDIR] = snapdir;
            }
            debug('loadConfig exit');
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
    debug('loadConfigFromFS entry');
    try {
      files = fs.readdirSync(dir);
    } catch (e) {
      debug('loadConfigFromFS error');
      cb(e);
      return;
    }
    
    debug('files: ', files);
    var jsonFile = new RegExp(/.*\.json$/);
    // correlate files with appropriate model
    files.forEach(
      function(file) {
        debug('file match jsonFile: ', file.match(jsonFile));
        // apim pull scenario (only json, no yaml)
        if (apimanager.host && file.match(jsonFile)) {
          for(var i = 0; i < models.length; i++) {
            if(file.indexOf(models[i].prefix) > -1) {
              debug('%s file: %s', models[i].name, file);
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

    cliConfig.loadProject(dir, {disableProjectResolution: true}).then(function(artifacts) { 
      debug('%j', artifacts); 
      artifacts.forEach(
        function(artifact)
          {
          if (artifact.type === 'swagger')
            {
            YAMLfiles.push(artifact.filePath)
            }
          }
        )
        // populate data-store models with the file contents
        populateModelsWithLocalData(app, YAMLfiles, dir, uid, cb);
    });
  }
}

function createProductID(product)
  {
  return (product.info['name'] + ':' + product.info['version']);
  }
  
function createAPIID(api)
  {
  return (api.info['x-ibm-name'] + ':' + api.info['version']);
  }

/**
 * Populates data-store models with persisted content
 * @param {???} app - loopback application
 * @param {Array} YAMLfiles - list of yaml files to process (should only be swagger)
 * @param {string} dir - path to directory containing persisted data to load
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateModelsWithLocalData(app, YAMLfiles, dir, uid, cb) {
  debug('populateModelsWithLocalData entry');
  var apis = {};
  async.series([
    function(seriesCallback) {
      async.forEach(YAMLfiles,
          function(file, fileCallback) {
            debug('Loading data from %s', file);
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
              console.log('product found: skipping')
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
                    console.error(err);
                    fileCallback(err);
                    return;
                  }
                  debug('%s created: %j',
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
    // create product with all the apis defined
    function(seriesCallback) {
        var entry = {};
        // no catalog
        entry.catalog = {};
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
        }
        debug('creating static product and attaching apis: ' + JSON.stringify(entry, null, 4))

        app.models['product'].create(
          entry,
          function(err, mymodel) {
            if (err) {
              console.error(err);
              seriesCallback(err);
              return;
            }
            debug('%s created: %j',
                  'product',
                  mymodel);
          seriesCallback();
          }
        );
      },
    // Hardcode default subscription for all plans
    function(seriesCallback) {
      var subscriptions = [
            {
            'catalog': {},
            'id': 'test subscription',
            'application': {
              'id': 'app name',
              'oauth-redirection-uri': 'https://localhost',
              'app-credentials': [{
                'client-id': 'default',
                'client-secret': 'CRexOpCRkV1UtjNvRZCVOczkUrNmGyHzhkGKJXiDswo='
              }]
            },
            'plan-registration': {
              'id': 'ALLPLANS'
                }
            }
            ];

        async.forEach(subscriptions,
          function(subscription, subsCallback) 
            {
            var modelname = 'subscription';
            subscription['snapshot-id'] = uid;
            app.models[modelname].create(
              subscription,
              function(err, mymodel) {
                if (err) {
                  console.error(err);
                  subsCallback(err);
                  return;
                }
                debug('%s created: %j',
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
      debug('found variable to replace: ' + value + ' with ' + replacevalue);
      object[x] = object[x].replace(value, replacevalue);
    }
  }
  return object;
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
          debug('property: ' + property);
          var propertyvalue = '$(' + property + ')';
          debug('propertyvalue: ' + propertyvalue);
          var replacementvalue;
          // is it an environment var?? $(envVar)
          var regEx = /\$\((.*)\)/;
          var matches = apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties[property].match(regEx)
          var envvar = matches[1];
          if (envvar) {
            if (!process.env[envvar]) {
              debug('Environment Variable not set for :' + envvar);
              }
            replacementvalue = process.env[envvar];
            }
          // just replace all the values straight up
          else {
            replacementvalue = apidoc['x-ibm-configuration'].catalogs['apic-dev'].properties[property];
            }
            apidoc = findAndReplace(apidoc, propertyvalue, replacementvalue)
            });
      }
    }
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
      debug('Load failed of: ', apiFile);
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
  debug('populateModelsWithAPImData entry');
  async.forEach(models,
    function(model, modelCallback) {
      async.forEach(model.files,
        function(typefile, fileCallback) {
          var file = path.join(dir, typefile);
          debug('Loading data from %s', file);
          var readfile;
          try {
            // read the content of the files into memory
            // and parse as JSON
            readfile = JSON.parse(fs.readFileSync(file));
          } catch(e) {
            fileCallback(e);
            return;
          }
          debug('filecontents: ', readfile);
          // inject 'snapshot-id' property
          readfile.forEach(
            function(obj) {
              obj['snapshot-id'] = uid;
            }
          );

          app.models[model.name].create(
            readfile,
            function(err, mymodel) {
              if (err) {
                console.error(err);
                fileCallback(err);
                return;
              }
              debug('%s created: %j',
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
      debug('populateModelsWithAPImData exit');
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
  debug('populateSnapshot entry');

  app.models.snapshot.create(
    {
      'id': uid,
      'refcount': '1',
      'current' : 'false'
    },
    function(err, mymodel) {
      if (err) {
        debug('populateSnapshot error');
        cb(err);
        return;
      }
      debug('populateSnapshot exit: %j', mymodel);
      cb();
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
  debug('updateSnapshot entry');

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
        app.models.snapshot.release(instance.id, function(err) {
            if (err) console.error(err);
          }
        );
      }
    }
  );
  app.models.snapshot.findById(uid, function(err, instance) {
      if (err) {
        debug('updateSnapshot error(1)');
        cb(err);
        return;
      }

      instance.updateAttributes(
        {
          'current' : 'true'
        },
        function(err, instance) {
          if (err) {
            debug('updateSnapshot error(2)');
            cb(err);
            return;
          }
          debug('updateSnapshot exit');
          cb();
        }
      );
    }
  );
}
