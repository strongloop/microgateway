var express = require('express')
var fs = require('fs');
var Promise = require('bluebird');
var path = require('path');
var Model = require('./model');
var pluralize = require('pluralize');
var _ = require('lodash');

function DataStore(options) {
  if (!(this instanceof DataStore)) {
    return new DataStore(options);
  }

  options = options || {};
  this.port = options.port || 3000;
  this.app = express();

  this.modelDirs = [path.resolve(__dirname, '../models')];
  if (options.modelDirs) {
    this.modelDirs.concat(options.modelDirs);
  }
}

DataStore.prototype.loadModels = function() {
  var self = this;
  self.models = {};
  var allModels = [];
  self.modelDirs.forEach(function(dir) {
    var files = fs.readdirSync(dir);
    files.filter(function(file) {return file.match(/\.js$/);})
         .forEach(function(file) {
           var name = file.slice(0, -3);
           var model = self.models[name];
           if (!model) {
             model = self.models[name] = new Model(name, self);
             self.app.use('/' + pluralize(name), model.app);
           }
           allModels.push(model.addHook(path.resolve(dir, file)));
         });
  });
  return Promise.all(allModels);
}

// DataStore.prototype.start = function(app) {
//   var self = this;
//   return this.loadModels()
//   .then(function() {
//     return new Promise(function(resolve, reject) {
//       self.server = self.app.listen(self.port, function(err) {
//         if (err) return reject(err);
//         console.log('server started, listening on port ' + self.port);
//         resolve();
//       })
//     })
//   });
// }
//
// DataStore.prototype.stop = function() {
//   var self = this;
//   return new Promise(function(resolve, reject) {
//     self.server.close(function() {
//       resolve();
//     });
//   });
// }

function loadData() {
  console.log('loadData: ' + process.env.CONFIG_DIR)
  if (process.env.CONFIG_DIR) {
    var FilePuller = require('../datahandler/file-puller');
    var puller = new FilePuller(process.env.CONFIG_DIR);
    return puller.run(this);
  }
}

DataStore.prototype.start = function(app) {
  return this.loadModels()
  .then(loadData.bind(this))
}

DataStore.prototype.stop = function() {
  return Promise.resolve();
}


exports = module.exports = DataStore;
