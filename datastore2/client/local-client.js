



function DataStoreClient(dataStore) {
  this.dataStore = dataStore;
}

DataStoreClient.prototype.getCurrentSnapshot = function() {
  return this.dataStore.models.snapshot.getCurrentSnapshot();
}

DataStoreClient.prototype.releaseCurrentSnapshot = function(snapshotId) {
  return this.dataStore.models.snapshot.releaseCurrentSnapshot(snapshotId);
}

DataStoreClient.prototype.matchRequest = function(snapshotId, method, path) {
  return this.dataStore.models.api.matchRequest(snapshotId, method, path);
}

exports = module.exports = DataStoreClient;
