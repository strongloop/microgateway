exports.server = function(model) {

  model.matchByClientId = function(snapshotId, apiId, path, method, clientId) {
    var subs = []
    model.db.where(function(doc) {
      if (doc.snapshotId != snapshotId) return;
      var creds = doc.application['app-credentials'].filter(function(c) {
        return c['client-id'] === clientId;
      });
      if (creds.length == 0) return;
      var product = doc['plan-registration'].product;
      // TODO: operation match not implemented yet
      if (product.document.apis[apiId])
        subs.push({ subscription: doc, 'app-credential': creds[0] });

    });
    return subs;
  };

}
