exports.server = function(model) {

  model.matchByClientId = function(snapshotId, apiId, path, method, clientId) {
    return model.db.query(function(doc, emit) {
      if (doc.snapshotId != snapshotId) return;
      var creds = doc.application['app-credentials'].filter(function(c) {
        return c['client-id'] === clientId;
      });
      if (creds.length == 0) return;
      var product = doc['plan-registration'].product;
      // TODO: operation match not implemented yet
      if (product.document.apis[apiId])
        emit({ subscription: doc, 'app-credential': creds[0] });
    })
    .then(function(result) {
      return result.rows.map(function(r) {
        return r.key;
      }) || [];
    });
  };

}
