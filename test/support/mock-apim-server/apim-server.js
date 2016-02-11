var  fs = require('fs')
  , https = require('https')
  , static = require('node-static')
  , port = 8080
  , host = '127.0.0.1';


var options = {
  key: fs.readFileSync(__dirname + '/key.pem'),
  cert: fs.readFileSync(__dirname + '/cert.pem')
};

var files = new static.Server(__dirname);

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

exports.start = function (host, port, cb) {
  var server = https.createServer(options, serveFiles);
  server.on('listening', function(err) {
      if (cb) cb(err);
    }
  );
  server.listen(port,host);
  return server;
};

//exports.start(host,port);

