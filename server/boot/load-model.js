var fs = require('fs');
var path = require('path');
var async = require('async');
var debug = require('debug')('strong-gateway:data-store');
var sgwapimpull = require('../../apim-pull');
var apimpull = sgwapimpull.pull;

var rootConfigPath = '/../../../config/';
var configFileName = 'apim.config';
var configFile = __dirname + rootConfigPath + configFileName;
var currentDefinitionsDir = __dirname + rootConfigPath + 'current/';
var latestDefinitionsDir = __dirname + rootConfigPath + 'latest/';

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

module.exports = function(app) {
  async.series([
    // if no apim.config, load what you have
    // if apim.config, grab fresh data if you can
    function(callback) {
      fs.access(configFile, fs.R_OK, function (err) {
          if (err) {
            debug('apim.config not found, loading from local files');
            callback();
          }
          else {
            debug('Found and have access to %s', configFile);
            // Have an APIm, grab latest if we can..
            fs.mkdir(latestDefinitionsDir, function() {
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
                options['outdir'] = latestDefinitionsDir;
                debug('apimpull start');
                apimpull(options,function(err, response) {
                    if (err) {
                      console.error(err);
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
    // load current config
    function(callback) {
      debug('loadConfigFromFS start');
      
      loadConfigFromFS(app, currentDefinitionsDir, function(callback) {
          debug('loadConfigFromFS end');
        }
      ); 
      callback();
    },
    // load current config
    function(callback) {
      debug('Load Complete');
      process.send('Load Complete');
      callback();
    }
  ]);
};

function loadConfigFromFS(app, dir, callback) {
  var files = fs.readdirSync(dir);
  debug('files: ', files);

  // Associate models with file names containing data that should be used
  // to populate the relevant model(s)
  // This section would need to be updated whenever new models are added
  // to the data-store
  var models = [];
  models[models.length] = new ModelType('catalog',
                     'catalogs-');
  models[models.length] = new ModelType('product', 
                     'products-');
  models[models.length] = new ModelType('api',
                     'apis-');
  models[models.length] = new ModelType('subscription',
                     'subs-');

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
