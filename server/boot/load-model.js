var fs = require('fs');
var path = require('path');
var async = require('async');
var debug = require('debug')('strong-gateway:data-store');
var sgwapimpull = require('../../apim-pull');
var apimpull = sgwapimpull.pull;

var rootConfigPath = '/../../../config/';
var configFileName = 'apim.config';
var configFile = __dirname + rootConfigPath + configFileName;
var currentDefinitionsDir = __dirname + rootConfigPath + 'current';

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
  models.push(new ModelType('snapshot', 'snapshots-')); // hack, removed later

  var config;

  async.series(
    [
      // stage the models
      function(callback) {
        stageModels(app, models, function(err) {
            models.pop(); // remove snapshot model
            callback(err);
          }
       );
      },
      // load config pointing to APIm, otherwise use persisted files
      function(callback) {
        loadAPImConfig(configFile, function(err, cfg) {
            config = cfg;
            callback();
          }
        );
      }
    ],
    // load the data into the models
    function(err, results) {
      if (!err) {
        loadData(app,
                    config,
                    models,
                    currentDefinitionsDir,
                    true); // first call to loadData()
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
 * @param {boolean} initial - whether or not this is the first call to
 *                            loadData()
 */
function loadData(app, config, models, currdir, initial) {
  var snapshotID, snapdir;
  async.series(
    [
      function(callback) {
        snapshotID = getSnapshotID();
        pullFromAPIm(config, snapshotID, function(err, dir) {
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
                   initial,
                   callback);
      }
    ],
    function(err, results) {
      setImmediate(scheduleLoadData,
                   app,
                   config,
                   models,
                   currdir);
    }
  );
}

function scheduleLoadData(app, config, models, dir) {
/* temporary workaround for leak & performance issues
  setTimeout(loadData,
             15 * 1000, // 15 seconds TODO: make configurable
             app,
             config,
             models,
             dir,
             false); // not first call to loadData()
*/
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
 * Loads configuration pointing to APIm server
 * @param {string} file - path to configuration file
 * @param {callback} cb - callback that handles error or configuration
 */
function loadAPImConfig(file, cb) {
  debug('loadAPImConfig');
  fs.access(file, fs.R_OK, function (err) {
      if (err) {
        debug('apim.config not found, loading from local files');
        debug('loadAPImConfig exit(1)');
        cb(null, null);
      }
      else {
        debug('Found and have access to %s', file);
        var config;
        try {
          config = JSON.parse(fs.readFileSync(file));
        } catch (e) {
          console.error(e);
          // try loading from local files
          debug('loadAPImConfig exit(2)');
          cb(null, null);
          return;
        }
        debug('loadAPImConfig exit(3)');
        cb(null, config);
      }
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
function pullFromAPIm(config, uid, cb) {
  debug('pullFromAPIm entry');
  if (config) {
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
        options['host'] = config['apim-ip'];
        options['outdir'] = snapdir;
        debug('apimpull start');
        apimpull(options,function(err, response) {
            if (err) {
              console.error(err);
              // failed, so try to clean up directory
              try {
                fs.unlinkSync(snapdir + '.*');
              } catch(e) {
                if (e.code !== 'ENOENT') {
                  console.error(e);
                }
                //continue
              }
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
 * @param {boolean} initial - whether or not this is the first call to
 *                            loadConfig()
 * @param {callback} cb - callback that handles error or successful completion
 */
function loadConfig(app, models, currdir, snapdir, uid, initial, cb) {
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
            if (initial) 
              process.send('Load Complete');
            // only update pointer to latest configuration
            // when latest configuration successful loaded
            if (snapdir === dirToLoad) {
                fs.unlinkSync(currdir);
                fs.symlinkSync(snapdir,
                               currdir,
                               'dir');
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
  debug('files: ', files);

  // correlate files with appropriate model
  files.forEach(
    function(file) {
      for(var i = 0; i < models.length; i++) {
        if(file.indexOf(models[i].prefix) > -1) {
          debug('%s file: %s', models[i].name, file);
          if (i === 0) {
            // clear out existing files from model structure
            models[i].files = [];
          }
          models[i].files.push(file);
          break;
        }
      }
    }
  );

  // populate data-store models with the file contents
  populateModels(app, models, dir, uid, cb);
}

/**
 * Populates data-store models with persisted content
 * @param {???} app - loopback application
 * @param {Array} models - instances of ModelType to populate with data
 * @param {string} dir - path to directory containing persisted data to load
 * @param {string} uid - snapshot identifier
 * @param {callback} cb - callback that handles error or successful completion
 */
function populateModels(app, models, dir, uid, cb) {
  debug('populateModels entry');
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
      debug('populateModels exit');
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