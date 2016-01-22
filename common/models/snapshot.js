var app = require('../../server/server');

module.exports = function(Snapshot) {
  Snapshot.observe('after save', function(ctx,next) {
  	  // delete instance when reference count is zero
      if (typeof ctx.data !=='undefined' &&
      	  typeof ctx.data.refcount !== 'undefined' && 
      	  ctx.data.refcount === '0' &&
      	  typeof ctx.where !== 'undefined' &&
      	  typeof ctx.where.id !== 'undefined') {
      	// remove from snapshot model
        Snapshot.destroyById(ctx.where.id, function(err) {
          }
        );
        var models = ['catalog', 'product', 'api', 'subscription'];

        var query = {
          'where' : {
            'snapshot-id' : ctx.where.id
          }
        };
        // remove from all other models
        models.forEach(function(model) {
            app.dataSources.db.automigrate(
              model,
              function(err) {
                if (!err) {
              	  app.models[model].destroyAll(query, function(err, info) {
                    }
                  );
                }
              }
            );
          }
        );
      }
      next();
    }
  );
  // addRef
  // increments reference count and returns the updated count
  Snapshot.addRef = function(id, cb) {
    Snapshot.findById(id, function(err, instance) {
        if (err) {
          cb(err);
          return;
        }
        
        var refCount = parseInt(instance.refcount) + 1;
        Snapshot.updateAll(
          {'id' : id },
          {'refcount' : refCount.toString() },
          function(err, info) {
            if (err) {
              cb(err);
              return;
            }
          }
        );
        cb(null, refCount);
      }
    );
  };
  Snapshot.remoteMethod (
    'addRef',
    {
      http: {path: '/addref', verb: 'get'},
      accepts: {arg: 'id', type: 'string', http: {source: 'query'}},
      returns: {arg: 'refcount', type: 'string'}
    }
  );

  // addRef
  // decrements reference count and returns the updated count
  Snapshot.release = function(id, cb) {
    Snapshot.findById(id, function(err, instance) {
        if (err) {
          cb(err);
          return;
        }
        
        var refCount = parseInt(instance.refcount) - 1;
        Snapshot.updateAll(
          {'id' : id },
          {'refcount' : refCount.toString() },
          function(err, info) {
            if (err) {
              cb(err);
              return;
            }
          }
        );
        cb(null, refCount);
      }
    );
  };
  Snapshot.remoteMethod (
    'release',
    {
      http: {path: '/release', verb: 'get'},
      accepts: {arg: 'id', type: 'string', http: {source: 'query'}},
      returns: {arg: 'refcount', type: 'string'}
    }
  );
};
