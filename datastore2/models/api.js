var Promise = require('bluebird');
var _ = require('lodash');

function makePathRegex(basePath, apiPath) {
  var path = apiPath;
  var braceBegin = -1;
  var braceEnd = -1;
  var variablePath;

  // remove the trailing /
  if (basePath) {
    basePath = basePath[basePath.length - 1] === '/' ?
        basePath.substr(0, basePath.length - 1) : basePath;
  } else {
    basePath = '';
  }

  // only the last param can have + to indicate multiple instance
  // need to check if path ends with param with prefix +

  var regex = /{\+([^}]+)}$/;
  var matches = regex.exec(path);
  if (matches) {
    // logger.debug('path before replacing multi instance: ', path);
    braceBegin = path.lastIndexOf('{');
    braceEnd = path.lastIndexOf('}') + 1;
    variablePath = path.substring(braceBegin, braceEnd);
    path = path.replace(variablePath, '.+');
    // logger.debug('path after replacing multi instance: ', path);
  }

  var regex_findPuls = /{\+([^}]+)}/;
  matches = regex_findPuls.exec(path);

  // give a warning if the {+param} is not at the end of the path.
  if (matches) {
    // logger.warn('api path \'' + apiPath + '\' contains \'{+param}\' that is not at the end of the path.' +
    //         ' This parameter will not be able to match multipl URI fragment.');
  }

  do {
    braceBegin = path.indexOf('{');
    if (braceBegin >= 0) {
      braceEnd = path.indexOf('}') + 1;
      variablePath = path.substring(braceBegin, braceEnd);
      path = path.replace(variablePath, '[^/]+');
      //path = path.replace(variablePath, '.+');
    }
  } while (braceBegin >= 0);
  if (apiPath === '/') {
    path = '^' + basePath + '/?$';
  } else {
    path = '^' + basePath + path + '/?$';
  }
  // logger.debug('path after: ', path);
  return path;
}

function calculateMatchingScore(apiPath) {
  var pathArray = apiPath.split('/');
  var pathScore = 0;
  for (var i = 0; i < pathArray.length; i++) {
    if (pathArray[i].indexOf('{') >= 0) {
      pathScore += Math.pow((pathArray.length - i), 2);
    }
  }
  return pathScore;
}

function generateMatchPaths(doc) {
  var result = [];
  _.forOwn(doc.paths, function(def, path) {
    var o = { path: path };
    o['regex'] = makePathRegex(doc.basePath, path);
    o['score'] = calculateMatchingScore(path);
    o['methods'] = _.keys(def).map(function(m) {
      return m.toUpperCase();
    });

    result.push(o);
  });
  return result;
}

exports.server = function(model) {

  model.beforeAdd = function(doc) {
    doc['api-paths'] = generateMatchPaths(doc);
    return Promise.resolve(doc);
  }

  model.matchRequest = function(snapshotId, method, path) {
    return model.db.query(function(doc, emit) {
      if (doc.snapshotId !== snapshotId) return;
      var paths = doc['api-paths'];
      var matches = [];
      for (var i = 0; i < paths.length; i++) {
        if (paths[i].methods.indexOf(method) > -1) {
          var re = new RegExp(paths[i].regex);
          if (re.test(path)) {
            matches.push({
              doc: doc,
              path: paths[i].path,
              method: method,
              score: paths[i].score
            });
          }
        }
      }
      var target = null;
      for (var i = 0; i < matches.length; i++) {
        if (!target || matches[i].score < target.score)
          target = matches[i];
      }
      if (target) emit(target);
    }).then(function(result) {
      return result.rows.sort(function(a, b) {
        return b.key.score - a.key.score;
      }).map(function(d) { return d.key });
    });
  }

  model.app.get('/matchRequest', function(req, res, next) {
    model.matchRequest(req.query.snapshotId, req.method, req.query.path).then(function(result) {
      res.send(result);
      next();
    }).catch(function(e) {
      next(e);
    });
  });

  // Server side implmentation for /findByPath
  model.findByPath = function(path) {
    var options = {selector: {}};
    options.selector['paths.' + path] = { $exists: true};
    return model.find(options);
  }

  model.app.get('/findByPath', function(req, res, next) {
    model.findByPath(req.query.path).then(function(result) {
      res.send(result);
      next();
    }).catch(function(e) {
      next(e);
    });
  });

}

// Remote method interface
exports.remote = function(model) {
  // TODO: model.request() not implemented yet
  model.matchRequest = function(path) {
    return model.request('/matchRequest?snapshotId=' + snapshotId + '&path=' + path);
  }
  
  model.findByPath = function(path) {
    return model.request('/findByPath?path=' + path);
  }
}
