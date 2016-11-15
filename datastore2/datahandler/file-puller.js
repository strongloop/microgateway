var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var path = require('path');

function FilePuller(dirName) {
  this.dirName = dirName;
}

var targetFiles = {
  'apis': 'api',
  'products': 'product',
  'registries': 'registry',
  'subscriptions': 'subscription',
  'tls-profiles': 'tls-profile'
};
FilePuller.prototype.run = function(dataStore) {
  var self = this;
  return fs.readdirAsync(self.dirName)
    .reduce(function(result, fileName) {
      var modelName = targetFiles[fileName];
      if (!modelName) return result;
      var filePath = path.resolve(self.dirName, fileName);
      return fs.readFileAsync(filePath, 'utf8').then(function(content) {
        var data = JSON.parse(content);
        if (fileName === 'apis') {
          data = data.map(function(doc) {
            return doc.document;
          });
        }
        result[modelName] = data;
        return result;
      });
    }, {})
    .then(function(docs) {
      return dataStore.models.snapshot.create(docs)
    });
}


exports = module.exports = FilePuller;
