var Promise = require('bluebird');
var express = require('express');
var pluralize = require('pluralize');
var _ = require('lodash');
var loki = require('lokijs');
var store = new loki('datastore');
// PouchDB.plugin(require('pouchdb-find'));


function Model(name, dataStore) {
  if (!(this instanceof Model)) {
    return new Model(name, dataStore, options);
  }
  this.app = express();
  this.name = name;
  this.dataStore = dataStore;
  this.db = store.addCollection(name);
}

Model.prototype.addHook = function(hook) {
  if (typeof hook !== 'string')
    throw new Error('Model hook should be string for the module name')
  var model = require(hook);
  if (typeof model.server === 'function')
    return model.server(this);
}

Model.prototype.beforeAdd = function(doc) {
  return doc;
}

Model.prototype.add = function(doc) {
  var self = this;
  if (_.isArray(doc)) {
    var docs = doc.map(function(d) {
      return self.beforeAdd(d);
    });
    return self.db.insert(docs);
  } else {
    self.beforeAdd(doc);
    return self.db.insert(doc);
  }
}

Model.prototype.update = function(doc) {
  return this.db.update(doc);
}

Model.prototype.find = function() {
  return this.db.find.apply(this.db, arguments);
}

module.exports = Model;
