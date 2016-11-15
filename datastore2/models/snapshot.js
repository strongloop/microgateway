var Promise = require('bluebird');
var _ = require('lodash');
var pluralize = require('pluralize');

function Snapshot() {
  this.id = ('0000' + Math.floor(Math.random() * (65536))).slice(-5);
  this.timestamp = new Date().getTime();
  this.models = {};
}

exports.server = function(model) {

  model.create = function(docs) {
    var snapshot = new Snapshot();
    var allDocs = {};
    _.forOwn(docs, function(modelDocs, modelName) {
      var pModelName = pluralize(modelName);
      modelDocs = modelDocs.map(function(doc) {
        doc.snapshotId = snapshot.id;
        return doc;
      });
      allDocs[pModelName] = model.dataStore.models[modelName].add(modelDocs);
    })
    return Promise.props(allDocs)
      .then(function(allDocs) {
        snapshot.models = allDocs;
        return model.add(snapshot);
      });
  }

  model.getCurrentSnapshot = function() {
    var options = {
      selector: {
        timestamp: { $gt: 0 }
      },
      sort: [{timestamp: 'desc'}],
      limit: 1
    };
    return model.find(options).then(function(result) {
      if (result.docs.length === 0) {
        throw new Error('no snapshot exist');
      }
      var snapshot = result.docs[0];
      snapshot.refcount = snapshot.refcount || 0;
      snapshot.refcount++;
      return model.update(snapshot).then(function(resp) {
        if (!resp.ok) {
          throw new Error('fail to increase snapshot refcount');
        }
        return snapshot.id;
      });
    });
  }

  model.releaseCurrentSnapshot = function(snapshotId) {
    var options = {
      selector: { id: snapshotId },
      limit: 1
    };
    return model.find(options).then(function(result) {
      if (result.docs.length === 0) {
        throw new Error('no snapshot exist');
      }
      var snapshot = result.docs[0];
      snapshot.refcount--;
      return model.update(snapshot).then(function(resp) {
        if (!resp.ok) {
          throw new Error('fail to decrease snapshot refcount');
        }
      });
    });
  }


  return model.db.createIndex({
    index: {
      fields: [ {timestamp: 'desc'} ],
      fields: [ 'timestamp'],
      name: 'byTimestamp',
      ddoc: 'byTimestamp'
    }
  }).then(function(d) {
    return model.db.createIndex({
      index: {
        fields: ['id'],
        name: 'byId',
        ddoc: 'byId'
      }
    });
  })
}
