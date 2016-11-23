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
  var organization, catalog;
  return fs.readdirAsync(self.dirName)
    .reduce(function(result, fileName) {
      var modelName = targetFiles[fileName];
      if (!modelName) return result;
      var filePath = path.resolve(self.dirName, fileName);
      return fs.readFileAsync(filePath, 'utf8').then(function(content) {
        var data = JSON.parse(content);
        if (fileName === 'apis') {
          data = data.map(function(doc) {
            organization = organization || doc.organization; // microgw only run on single org/catalog
            catalog = catalog || doc.catalog;
            doc.document['x-ibm-organization'] = { id: organization.id, name: organization.name };
            doc.document['x-ibm-catalog'] = { id: catalog.id, name: catalog.name };
            doc.document['x-ibm-api-id'] = doc.id;
            doc.document['x-ibm-api-state'] = doc.state;
            return doc.document;
          });
        }
        result[modelName] = data;
        return result;
      });
    }, {})
    .then(function(docs) {
      docs.organization = [organization];
      docs.catalog = [catalog];
      return dataStore.models.snapshot.create(docs)
    });
}


exports = module.exports = FilePuller;
