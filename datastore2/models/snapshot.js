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

  model.current = function() {
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

  model.release = function(snapshotId) {
    var found = false;
    _.some(snapshots, function(snapshot) {
      if (snapshot.id === snapshotId) {
        found = true;
        snapshot.refcount--;
        // TODO: cleanup non-latest snapshot if refcount reach 0
        return true;
      }
    });
    return found;
  }

  model.app.get('/current', function(req, res, next) {
    try {
      var id = model.current();
      res.send({ snapshotId: id });
      next();
    } catch(e) {
      next(e);
    }
  });

  model.app.get('/release', function(req, res) {
    if (!req.query.snapshotId) {
      res.status(500).send({ reason: 'snapshotId not provided' })
      return;
    }
    var released = model.release(req.query.snapshotId);
    if (!released) {
      res.status(500).send({ reason: 'Cannot find the snapshotId: ' + req.query.snapshotId });
      return;
    }
    res.send({ ok: true });
  });

}

exports.remote = function(model) {
  model.current = function() {
    return model.request({
      method: 'GET',
      uri: '/current',
    });
  };

  model.release = function(snapshotId) {
    return model.request({
      method: 'GET',
      uri: '/release',
      qs: { snapshotId: snapshotId }
    });
  };
}
