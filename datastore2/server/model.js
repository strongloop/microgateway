var Promise = require('bluebird');
var PouchDB = require('pouchdb-memory');
var express = require('express');
var pluralize = require('pluralize');
var _ = require('lodash');

PouchDB.plugin(require('pouchdb-find'));


function Model(name, dataStore) {
  if (!(this instanceof Model)) {
    return new Model(name, dataStore, options);
  }
  this.app = express();
  this.name = name;
  this.dataStore = dataStore;
  // this.db = new PouchDB('http://localhost:5984/' + pluralize(name));
  this.db = new PouchDB(pluralize(name));
}

Model.prototype.addHook = function(hook) {
  if (typeof hook !== 'string')
    throw new Error('Model hook should be string for the module name')
  var model = require(hook);
  if (typeof model.server === 'function')
    return model.server(this);
}

Model.prototype.beforeAdd = function(doc) {
  return Promise.resolve(doc);
}

Model.prototype.createIndex = function(index) {
  return this.db.createIndex({index: index});
}

Model.prototype.add = function(doc) {
  var self = this;
  if (_.isArray(doc)) {
    var docs = doc;
    var promises = [];
    promises = docs.map(function(doc) {
      return self.beforeAdd(doc);
    });
    var promise = Promise.all(promises).then(function(docs) {
      return self.db.bulkDocs(docs);
    });
    var committedDocs = [];
    return promise.then(function(result) {
      var errors = [];
      result.forEach(function(docResult) {
        if (docResult.ok) {
          committedDocs.push(docResult.id);
        } else {
          errors.push(docResult);
        }
      });
      if (errors.length > 0) {
        return Promise.reject(new Error("Error when adding document(s) of " + self.name));
      }
    })
    .then(function() {
      return committedDocs;
    });
  } else {
    return self.beforeAdd(doc)
      .then(function(doc) {
        return self.db.post(doc);
      })
      .then(function(result) {
        return [result.id];
      });
  }
}

Model.prototype.update = function(doc) {
  return this.db.put(doc);
}

Model.prototype.find = function() {
  return this.db.find.apply(this.db, arguments);
}

Model.prototype.get = function(id, rev, options) {
  if (rev && typeof rev === 'object') {
    options = rev;
    rev = null;
  } else {
    options = options || {};
  }
  if (rev) {
    options.rev = rev;
  }
  return this.db.get(id, options);
}


module.exports = Model;
