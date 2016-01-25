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
var uniqueDefinitionsDir = '';
var snapshotID;

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

// Returns a random integer between 0 (included) 2^16 - 1 (included).
// Hopefully there will not be this many concurrent configuration
// updates.
function getSnapshotID() {
  return ('0000' + Math.floor(Math.random() * (65536))).slice(-5);
}

module.exports = function(app) {
  async.series([
    // if no apim.config, load what you have
    // if apim.config, grab fresh data if you can
    function(callback) {
      snapshotID = getSnapshotID();
      fs.access(configFile, fs.R_OK, function (err) {
          if (err) {
            debug('apim.config not found, loading from local files');
            callback();
          }
          else {
            debug('Found and have access to %s', configFile);
            // Have an APIm, grab latest if we can..
            uniqueDefinitionsDir =  __dirname +
                                    rootConfigPath +
                                    snapshotID +
                                    '/';
            fs.mkdir(uniqueDefinitionsDir, function() {
                var config;
                try {
                  config = JSON.parse(fs.readFileSync(configFile));
                } catch (e) {
                  console.error(e);
                  // try loading from local files
                  callback();
                  return;
                }        

                var options = {};
                options['host'] = config['apim-ip'];
                options['outdir'] = uniqueDefinitionsDir;
                debug('apimpull start');
                apimpull(options,function(err, response) {
                    if (err) {
                      console.error(err);
                      try {
                        fs.unlinkSync(uniqueDefinitionsDir + '.*');
                      } catch(e) {
                        if (e.code !== 'ENOENT') {
                          console.error(e);
                        }
                        //continue
                      }
                      try {
                        fs.rmdirSync(uniqueDefinitionsDir);
                      } catch(e) {
                        console.error(e);
                        //continue
                      }
                      uniqueDefinitionsDir = '';
                      // falling through
                      // try loading from local files
                    }
                    debug(response);
                    debug('apimpull end');
                    callback();
                  }
                );
              }
            );
          }
        }
      );
    },
    // populate snapshot db
    function(callback) {
      debug('snapshot population start');

      app.dataSources.db.automigrate(
        'snapshot',
        function(err) {
          debug('snapshot automigrate');
          if (err) {
            callback(err);
            return;
          }
          app.models.snapshot.create(
            {
              'id': snapshotID,
              'refcount': '1',
              'current' : 'false'
            },
            function(err, mymodel) {
              debug('snapshot create');
              if (err) {
                callback(err);
                return;
              }
              debug('snapshot created: %j', mymodel);
              callback();
            }
          );
        }
      );
    },
    // load current config
    function(callback) {
      debug('loadConfigFromFS start');

      var dirToLoad = (uniqueDefinitionsDir === '') ?
                        (currentDefinitionsDir + '/') :
                        uniqueDefinitionsDir;
      loadConfigFromFS(app, dirToLoad, snapshotID, function(err) {
          debug('loadConfigFromFS end');
          if (err) {
            console.error(err);
            callback(err);
            return;
          }
          else {
            // update current snapshot pointer
            app.models.snapshot.findById(snapshotID, function(err, instance) {
                if (err) {
                  callback(err);
                  return;
                }

                instance.updateAttributes(
                  {
                    'current' : 'true'
                  },
                  function(err, instance) {
                    if (err) {
                      callback(err);
                      return;
                    }
                    process.send('Load Complete');
                    // only update pointer to latest configuration
                    // when latest configuration successful loaded
                    if (uniqueDefinitionsDir === dirToLoad) {
                        fs.unlinkSync(currentDefinitionsDir);
                        fs.symlinkSync(uniqueDefinitionsDir,
                                       currentDefinitionsDir,
                                       'dir');
                    }
                    callback();
                  }
                );
              }
            );
          }
        }
      );
    }
  ]);
};

function loadConfigFromFS(app, dir, uid, callback) {
  var files = fs.readdirSync(dir);
  debug('files: ', files);

  // Associate models with file names containing data that should be used
  // to populate the relevant model(s)
  // This section would need to be updated whenever new models are added
  // to the data-store
  var models = [];
  models.push(new ModelType('catalog', 'catalogs-'));
  models.push(new ModelType('product', 'products-'));
  models.push(new ModelType('api', 'apis-'));
  models.push(new ModelType('subscription', 'subs-'));

  // read the content of the files into memory
  files.forEach(
    function(file) {
      for(var i = 0; i < models.length; i++) {
        if(file.indexOf(models[i].prefix) > -1) {
          debug('%s file: %s', models[i].name, file);
          models[i].files.push(file);
          break;
        }
      }
    }
  );

  // populate data-store models with the file contents
  models.forEach(
    function(model) {
      model.files.forEach(
        function(typefile) {
          var file = path.join(dir, typefile);
          debug('Loading data from %s', file);
          var readfile;
          try {
            readfile = JSON.parse(fs.readFileSync(file));
          } catch(e) {
            callback(e);
            return;
          }
          debug('filecontents: ', readfile);
          // inject 'snapshot-id' property
          readfile.forEach(
            function(obj) {
              obj['snapshot-id'] = uid;
            }
          );
          app.dataSources.db.automigrate(
            model.name,
            function(err) {
              if (err) {
                callback(err);
                return;
              }
              app.models[model.name].create(
                readfile,
                function(err, mymodel) {
                  if (err) {
                    callback(err);
                    return;
                  }
                  debug('%s created: %j',
                      model.name,
                      mymodel);
                }
              );
            }
          );
        }
      );
    }
  );
  callback();
}
