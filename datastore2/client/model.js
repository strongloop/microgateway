var request = require("request-promise");
var pluralize = require('pluralize');

function Model(name, dataStoreClient) {
  if (!(this instanceof Model)) {
    return new Model(name, dataStore);
  }
  this.name = name;
  this.dataStore = dataStoreClient;
  this.request = request.defaults({
    baseUrl: dataStoreClient.baseUrl + '/' + pluralize(name),
    json: true
  });
}


Model.prototype.addHook = function(hook) {
  if (typeof hook !== 'string')
    throw new Error('Model hook should be string for the module name')
  var model = require(hook);
  if (typeof model.remote === 'function')
    return model.remote(this);
}

module.exports = Model;
