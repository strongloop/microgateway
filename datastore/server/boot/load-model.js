var fs = require('fs');
var path = require('path');
var async = require('async');
var YAML = require('yamljs');
var debug = require('debug')('strong-gateway:data-store');
var sgwapimpull = require('../../apim-pull');
var apimpull = sgwapimpull.pull;
var environment = require('../../../utils/environment');
var APIMANAGER = require('../../../utils/environment').APIMANAGER;
var CONFIGDIR = require('../../../utils/environment').CONFIGDIR;

var rootConfigPath = '/../../../config/';
var defaultDefinitionsDir = __dirname + rootConfigPath + 'default';
var definitionsDir = defaultDefinitionsDir;

var subscriptionsFilename = 'subscriptions.json';
var subscriptionsConfig = __dirname + rootConfigPath + subscriptionsFilename;

var laptopexperience = true;
process.env['laptopexperience']=laptopexperience;

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
  models.push(new ModelType('product', 'products-'));
  models.push(new ModelType('api', 'apis-'));
  models.push(new ModelType('subscription', 'subs-'));
  // add new models above this line
  models.push(new ModelType('optimizedData', 'dummy'));
  models.push(new ModelType('snapshot', 'dummy')); // hack, removed later

  var apimanager;

  async.series(
    [
      function(callback) {
        // get CONFIG_DIR.. two basic paths APIm load or local
        // if no apim.config or ENV var, load default dir.. APIm 
        // if apim.config or ENV var, 
        //    if apimanager specified, dir = "last known config"..
        //    if no apimanager specified, dir will be loaded.. 
        environment.getVariable(
          CONFIGDIR,
          function(value) {
            // Load local files...
            if (value) {
              definitionsDir=value;
            }
          },
          callback
        );
      },
      function(callback) {
        // get apimanager ip
        // if no apim.config or ENV var, load what you have
        // if apim.config or ENV var, grab fresh data if you can
        environment.getVariable(
          APIMANAGER,
          function(value) {
            apimanager = value;
            if (apimanager)
              {
              laptopexperience=false;
              process.env['laptopexperience']=laptopexperience;
              }
            },
          callback
        );
      },
      // stage the models
      function(callback) {
        stageModels(app, models, function(err) {
            models.pop(); // remove snapshot model
            models.pop(); // remove optimizedData model
            callback(err);
          }
       );
      }
    ],
    // load the data into the models
    function(err, results) {
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
  var snapshotID, snapdir;
  async.series(
    [
      function(callback) {
        snapshotID = getSnapshotID();
        pullFromAPIm(apimanager, snapshotID, function(err, dir) {
            snapdir = dir;
            callback();
          }
        );
      },
      // populate snapshot model
      function(callback) {
        populateSnapshot(app, snapshotID, callback);
      },
      // load current config
      function(callback) {
        loadConfig(app,
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
  if (!laptopexperience)
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
 * Attempt to request data from APIm server and persist to disk
 * @param {Object} config - configuration pointing to APIm server
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or path to
 *                        snapshot directory
 */
function pullFromAPIm(apimanager, uid, cb) {
  debug('pullFromAPIm entry');
  if (apimanager) {
    // Have an APIm, grab latest if we can..
    var snapdir =  __dirname +
                   rootConfigPath +
                   uid +
                   '/';
    fs.mkdir(snapdir, function(err) {
        if (err) {
          debug('pullFromAPIm exit(1)');
          cb(null, '');
          return;
        }

        var options = {};
        options['host'] = apimanager;
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
  } else {
    debug('pullFromAPIm exit(3)');
    cb(null, '');
  }
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
function loadConfig(app, models, currdir, snapdir, uid, cb) {
  debug('loadConfig entry');

  var dirToLoad = (snapdir === '') ?
                    (currdir + '/') :
                    snapdir;
  loadConfigFromFS(app, models, dirToLoad, uid, function(err) {
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
                environment.setConfigFileVariable(CONFIGDIR, 
                            snapdir);
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
function loadConfigFromFS(app, models, dir, uid, cb) {
  var files;
  debug('loadConfigFromFS entry');
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    debug('loadConfigFromFS error');
    cb(e);
    return;
  }
  var YAMLfiles = [];
  debug('files: ', files);
  var jsonFile = new RegExp(/.*\.json$/);
  var yamlFile = new RegExp(/(.*\.yaml$)|(.*\.yml$)/);

  // clear out existing files from model structure
  models.forEach(
    function(model) {
      model.files = [];
    }
  );

  // correlate files with appropriate model
  files.forEach(
    function(file) {
      debug('file match jsonFile: ', file.match(jsonFile));
      debug('file match yamlFile: ', file.match(yamlFile));
      // apim pull scenario (only json, no yaml)
      if (!laptopexperience && 
          file.match(jsonFile)) {
        for(var i = 0; i < models.length; i++) {
          if(file.indexOf(models[i].prefix) > -1) {
            debug('%s file: %s', models[i].name, file);
            models[i].files.push(file);
            break;
          }
        }
      }
      // laptop experience scenario (only yaml, no json)
      if (laptopexperience && 
          file.match(yamlFile)) {
        YAMLfiles.push(file);
      }
    }
  );
  
  if (laptopexperience) {
    populateModelsWithLocalData(app, YAMLfiles, dir, uid, cb);
  }
  else {
    // populate data-store models with the file contents
    populateModelsWithAPImData(app, models, dir, uid, cb);
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
 * @param {Array} YAMLfiles - list of yaml files to process
 * @param {string} dir - path to directory containing persisted data to load
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateModelsWithLocalData(app, YAMLfiles, dir, uid, cb) {
  debug('populateModelsWithLocalData entry');
  var apis = {};
  async.series([
    function(seriesCallback) {
      async.forEach(YAMLfiles,
          function(typefile, fileCallback) {
            var file = path.join(dir, typefile);
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
            // convert to json.. determine model
            
            // Product=
            // product: 1.0.0
            // info:
            //  name: climb-on
            //  title: Climb On
            //  version: 1.0.0
      
            // API=
            //  swagger: '2.0'
            //  info:
            //    x-ibm-name: route
            //    title: Route
            //    version: 1.0.0
            
            debug('readfile %s', JSON.stringify(readfile));
            debug('Product %s', readfile.product);
            debug('Swagger %s', readfile.swagger);
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
        entry.document = 
          {
          "product": "1.0.0",
          "info": {
            "name": "static product",
            "version": "1.0.0",
            "title": "static-product"
          },
          "visibility": {
            "view": {
              "type": "public"
            },
            "subscribe": {
              "type": "authenticated"
            }
          },
          "apis": apis,
          "plans": {
            "default": {
              "apis": apis
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
    // Try to read a static subscriptions..
    function(seriesCallback) {
          var file = subscriptionsConfig;
          var subscriptions;
          try {
            // read the content of the files into memory
            // and parse as JSON
            subscriptions = JSON.parse(fs.readFileSync(file));
            debug('subscriptions filename: ' + file);
            debug('subscriptions file: ' + 
              JSON.stringify(subscriptions, null, 4));
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
            
          } catch(e) {
            seriesCallback(e);
            return;
          }
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
      console.log('found one');
      object[x] = object[x].replace(value, replacevalue);
    }
  }
  return object;
}

function expandAPIData(apidoc, dir)
  {
  // add the assembly
  if (apidoc['x-ibm-configuration'])
    {
    if (apidoc['x-ibm-configuration'].assembly && 
      apidoc['x-ibm-configuration'].assembly['$ref']) {
      var assemblyFile = path.join(dir, 
        apidoc['x-ibm-configuration'].assembly['$ref']);
      var assembly = YAML.load(assemblyFile);
      apidoc['x-ibm-configuration'].assembly = assembly;
      }
    if (apidoc['x-ibm-configuration'].properties)
      {
      Object.getOwnPropertyNames(apidoc['x-ibm-configuration'].properties).forEach(
        function (property) 
          {
          debug('property: ' + property)
          debug('apidoc[x-ibm-configuration][properties][property][value]: ' + JSON.stringify(apidoc['x-ibm-configuration']['properties'][property]['value']))
          debug('before apidoc: ' + JSON.stringify(apidoc))
          var propertyvalue = '$(' + property + ')';
          debug('property: ' + propertyvalue);
          apidoc = findAndReplace(apidoc, propertyvalue, apidoc['x-ibm-configuration']['properties'][property]['value'])
          debug('after apidoc: ' + JSON.stringify(apidoc))
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
