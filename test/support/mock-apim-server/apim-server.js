var Promise = require('bluebird')
  , fs = require('fs')
  , https = require('https')
  , static = require('node-static')
  , port = 8080
  , host = '127.0.0.1';


var server;

/**
 * Start a mock apim server. Two ways to start it:
 *  - start(host, port, path, cb)
 *  - start(host, port, cb)
 *
 * @param host {string} hostname
 * @param port {integer} port number
 * @param path {string} optional, specifying the path to load apim config files
 */
exports.start = function (host, port, path) {
  return new Promise(function(resolve, reject) {
    path = path || __dirname;

    var options = {
      key: fs.readFileSync(__dirname + '/key.pem'),
      cert: fs.readFileSync(__dirname + '/cert.pem')
    };

    var files = new static.Server(path);

    function serveFiles(request, response) {
      files.serve(request, response, function (err, res) {
          if (err) {
            console.error('> Error serving ' + request.url + ' - ' + err.message);
            response.writeHead(err.status, err.headers);
            response.end();
          } else {
            console.log('> ' + request.url + ' - ' + res.message);
          }
        }
      );
    }

    server = https.createServer(options, serveFiles);
    server.listen(port, host, function(err) {
      if (err) {
        reject(err);
      } else {
        console.log('mock-apim-server listening on port ' + port);
        resolve();
      }
    });

  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    server.close(function() {
      resolve(0);
    });
  });
};

//exports.start(host,port);

