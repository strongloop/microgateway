var fs = require('fs');
var path = require('path');
var Model = require('./model');

function DataStoreClient(options) {
  if (!(this instanceof DataStoreClient)) {
    return new DataStoreClient(options);
  }

  options = options || {};
  this.models = {};
  var port = options.port || process.env.DATASTORE_PORT || 5555;
  this.baseUrl = options.baseUrl || 'http://localhost:' + port;

  this.modelDirs = [path.resolve(__dirname, '../models')];
  if (options.modelDirs) {
    this.modelDirs.concat(options.modelDirs);
  }
  var self = this;
  this.modelDirs.forEach(function(dir) {
    fs.readdirSync(dir)
      .filter(function(file) {return file.match(/\.js$/);})
      .forEach(function(file) {
         var name = file.slice(0, -3);
         var model = self.models[name];
         if (!model) {
           model = self.models[name] = new Model(name, self);
         }
         model.addHook(path.resolve(dir, file));
       });
  });

}

exports = module.exports = DataStoreClient;
