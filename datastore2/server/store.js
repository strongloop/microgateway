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
  this.port = options.port || 5555;
  this.app = options.app || express();
  this.models = {};

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
           self.app.use('/' + pluralize(name), model.app);
         }
         model.addHook(path.resolve(dir, file));
       });
  });
}

// function loadData(dataStore) {
//   console.log('loadData: ' + process.env.CONFIG_DIR)
//   if (process.env.CONFIG_DIR) {
//     var FilePuller = require('../datahandler/file-puller');
//     var puller = new FilePuller(process.env.CONFIG_DIR);
//     return puller.run(dataStore);
//   } else {
//     console.log('Environment variable CONFIG_DIR not set yet');
//   }
// }

// function startServer() {
//   var self = this;
//   return new Promise(function(resolve, reject) {
//     self.server = self.app.listen(self.port, function(err) {
//       if (err) return reject(err);
//       console.log('server started, listening on port ' + self.port);
//       resolve();
//     })
//   });
// }

// DataStore.prototype.start = function() {
//   return loadData(this).then(startServer.bind(this));
// }
//
// DataStore.prototype.stop = function() {
//   var self = this;
//   if (self.server) {
//     return new Promise(function(resolve, reject) {
//       self.server.close(function() {
//         self.server = undefined;
//         resolve();
//       });
//     });
//   } else {
//     return Promise.resolve();
//   }
// }


exports = module.exports = DataStore;
