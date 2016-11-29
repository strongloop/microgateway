var Promise = require('bluebird');
var _ = require('lodash');
var pluralize = require('pluralize');

function Snapshot() {
  this.id = ('0000' + Math.floor(Math.random() * (65536))).slice(-5);
  this.timestamp = new Date().getTime();
  this.models = {};
}


var snapshots = [];

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
    var snapshot = model.db.chain().simplesort('timestamp', true).limit(1).data()[0];
    if (!snapshot) {
      throw new Error('no snapshot exist');
    }
    var lastSnapshot = snapshots[0];
    if (!lastSnapshot || lastSnapshot.id !== snapshot.id) {
      snapshots.unshift({id: snapshot.id, refcount: 1});
    } else {
      lastSnapshot.refcount++;
    }
    return snapshot.id;
  }

  model.releaseCurrentSnapshot = function(snapshotId) {
    _.some(snapshots, function(snapshot) {
      if (snapshot.id === snapshotId) {
        snapshot.refcount--;
        // TODO: cleanup non-latest snapshot if refcount reach 0
        return true;
      }
    });
  }

}
