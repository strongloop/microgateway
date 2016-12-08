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

  model.app.get('/matchByClientId', function(req, res) {
    var missing = [];
    if (!req.query.snapshotId) { missing.push('snapshotId'); }
    if (!req.query.apiId) { missing.push('apiId'); }
    if (!req.query.path) { missing.push('path'); }
    if (!req.query.method) { missing.push('method'); }
    if (!req.query.clientId) { missing.push('clientId'); }
    if (missing.length > 0) {
      res.status(500).send({ reason: 'Missing parameter(s): ' + missing.join(', ') });
      return;
    }
    var subs = model.matchByClientId(
          req.query.snapshotId,
          req.query.apiId,
          req.query.path,
          req.query.method,
          req.query.clientId
        );
    res.send(subs);
  });
}



// Remote method interface
exports.remote = function(model) {
  model.matchByClientId = function(snapshotId, apiId, path, method, clientId) {
    return model.request({
      method: 'GET',
      uri: '/matchByClientId',
      qs: { snapshotId: snapshotId, apiId: apiId, path: path, method: method, clientId: clientId }
    });
  }

}
