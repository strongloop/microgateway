// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var app = require('../../server/server');
var fs = require('fs-extra');
var path = require('path');

module.exports = function(Snapshot) {
  Snapshot.observe('after delete', function(ctx, next) {
    if (typeof ctx.instance === 'object') {
      // delete relevant snapshots from other models
      var models = [ 'optimizedData',
                     'catalog',
                     'product',
                     'api',
                     'subscription',
                     'tlsprofile',
                     'registry' ];

      var query = { 'snapshot-id': ctx.instance.id };
      models.forEach(function(model) {
        app.models[model].destroyAll(query,
                function(err, info) { if (err) { /* suppress eslint handle-callback-err */ } });
      });

      fs.remove(
        path.join(process.env.ROOTCONFIGDIR, ctx.instance.id),
        function(err) { if (err) { /* suppress eslint handle-callback-err */ } });
    }

    next();
  });

  // current
  // returns current snapshot id object (after incrementing reference count)
  Snapshot.current = function(cb) {
    Snapshot.findOne(
      { where: { current: 'true' } },
      function(err, instance) {
        if (err) {
          cb(err);
          return;
        }
        var refCount = parseInt(instance.refcount, 10) + 1;
        instance.updateAttributes(
          { refcount: refCount.toString() },
          function(err, instance) {
            if (err) {
              cb(err);
              return;
            }
            cb(null, instance);
          });
      });
  };

  Snapshot.remoteMethod(
    'current',
    { http: { path: '/current', verb: 'get' },
      returns: { arg: 'snapshot', type: 'object' } }
  );

  // release
  // decrements reference count and returns the updated count
  Snapshot.release = function(id, cb) {
    Snapshot.findById(id, function(err, instance) {
      if (err) {
        cb(err);
        return;
      }

      var refCount = parseInt(instance.refcount, 10) - 1;
      if (refCount === 0) {
        // delete if reference count is zero and return empty object
        instance.destroy(
          function(err) {
            if (err) { /* suppress eslint handle-callback-err */ }
            cb(null, {});
          });
      } else {
        // otherwise, update reference count
        instance.updateAttributes(
          { refcount: refCount.toString() },
          function(err, instance) {
            if (err) {
              cb(err);
              return;
            }
            cb(null, instance);
          });
      }
    });
  };

  Snapshot.remoteMethod(
    'release',
    { http: { path: '/release', verb: 'get' },
      accepts: { arg: 'id', type: 'string', http: { source: 'query' } },
      returns: { arg: 'snapshot', type: 'object' } });
};
