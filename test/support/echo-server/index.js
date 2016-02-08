'use strict'

let express = require('express');
let app = express();

app.get('/*', function(req, resp) {
  resp.send(req.url);
});

app.post('/*', function(req, resp) {
  req.pipe(resp);
});

let server;
exports.start = function(port) {
  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      console.log('echo-server listening on port %d', port);
      resolve();
    });
  });
};

exports.stop = function() {
  return new Promise((resolve, reject) => {
    if (server) {
      server.close(() => {
        resolve();
      });
    } else {
      resolve();
    }
  });
}

exports.app = app;

if (require.main === module) {
  exports.start(8889).
    then(() => {
      console.log('echo-server listening on port 8889');
    });
}
