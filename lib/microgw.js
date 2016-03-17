'use strict'

var Promise = require('bluebird');
var express = require('express');
var urlrewrite = require('./urlrewrite');
var context = require('./context');
var preflow = require('./preflow');
var postflow = require('./postflow');
var assembly = require('./assembly');
var ds = require('../datastore');
var path = require('path');
var ploader = require('./policy-loader');
var _       = require('lodash');
var fs      = require('fs');
var https   = require('https');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:microgw'});
var errhandler = require('./error-handler');
var analytics = require('./analytics');

//load policies
//if there is projectDir, pass it as one of the option
var policies = ploader.createMGLoader({'override':false});

var defaultCert =
  '-----BEGIN CERTIFICATE-----\n' +
  'MIIC1zCCAkACCQCvTHR9TkwBOzANBgkqhkiG9w0BAQUFADCBrzELMAkGA1UEBhMC\n' +
  'VVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRAwDgYDVQQHEwdSYWxlaWdoMSgw\n' +
  'JgYDVQQKEx9JbnRlcm5hdGlvbmFsIEJ1c2luZXNzIE1hY2hpbmVzMRQwEgYDVQQL\n' +
  'EwtBUEkgQ29ubmVjdDEVMBMGA1UEAxMMYXBpYy5pYm0uY29tMR4wHAYJKoZIhvcN\n' +
  'AQkBFg9hcGljQHVzLmlibS5jb20wHhcNMTYwMzEwMDI0MDA0WhcNMTgwMzEwMDI0\n' +
  'MDA0WjCBrzELMAkGA1UEBhMCVVMxFzAVBgNVBAgTDk5vcnRoIENhcm9saW5hMRAw\n' +
  'DgYDVQQHEwdSYWxlaWdoMSgwJgYDVQQKEx9JbnRlcm5hdGlvbmFsIEJ1c2luZXNz\n' +
  'IE1hY2hpbmVzMRQwEgYDVQQLEwtBUEkgQ29ubmVjdDEVMBMGA1UEAxMMYXBpYy5p\n' +
  'Ym0uY29tMR4wHAYJKoZIhvcNAQkBFg9hcGljQHVzLmlibS5jb20wgZ8wDQYJKoZI\n' +
  'hvcNAQEBBQADgY0AMIGJAoGBANP040jbW1X+lWcdf+xwzBQZpecdUG56pL2NRZvr\n' +
  'bV+6GMz/xZ+hlCmwxli9lGCn+gpVIqk4NTmuA1iJ71VRZtEC7zRWqygIiPjSpdid\n' +
  'fG/SgPguKvWt24jRA7dfsVXE+X5qcpy767rKZzAFCgUArks+XCAYBNFh/FnV6wk2\n' +
  'EwNRAgMBAAEwDQYJKoZIhvcNAQEFBQADgYEALnvK7dfRReVaaG4+DacIQMTJt1kF\n' +
  'D7bKWmxdJV6M6Yion/jDNpNls2wilkaogvcVwaJ0kdBOimn4XQwmew5SRxRdoc9F\n' +
  '0+u0oDYfDneaDAuW+anj7JmwZvlWzG0525+pgsQV5rOoAWGzcOVQGwSP5yTFiIDU\n' +
  '7ZVSdeHUM7nLUCQ=\n' +
  '-----END CERTIFICATE-----';
var defaultKey =
  '-----BEGIN RSA PRIVATE KEY-----\n' + 
  'MIICXgIBAAKBgQDT9ONI21tV/pVnHX/scMwUGaXnHVBueqS9jUWb621fuhjM/8Wf\n' + 
  'oZQpsMZYvZRgp/oKVSKpODU5rgNYie9VUWbRAu80VqsoCIj40qXYnXxv0oD4Lir1\n' +
  'rduI0QO3X7FVxPl+anKcu+u6ymcwBQoFAK5LPlwgGATRYfxZ1esJNhMDUQIDAQAB\n' +
  'AoGBAIcm5uqlHMdnz2Jx+AkPH8JNXHFTSt83iuZnN5SleReKNZg6G4yfXjd7Re59\n' +
  '7Cf51EFUagaXFbFS2UVSpu6zOigxccGacX/7aMGz/nhJpC5JPH8Wsmnt4ZSiDiTQ\n' +
  'Ul5GldgWgsjzVSLcVefwzeaTj1qaMrdD/5GZOxlI6rh+PFgBAkEA6fOZ/yQirboD\n' +
  '94HPvyWRJ/4sh8xzcGLSjVToIdbHPB+z19dWEed5RQ1C0nkJMFgkxZAy9L8at4v7\n' +
  'btMdpoS5gQJBAOfuoLF/4zu+uMq/GcghMbB6nxT6N0fI3JEDTOIguHFjK05v4fU2\n' +
  'gaa4mjdgUPZsISH6DWe+aSX/EjN85IpmEdECQFIi/YEPTcGSmkvuXmKsrM7OtRGk\n' +
  'XS8q8uM92RXwUxivxLNV3dkBXJk6s6gzaF95wsc9/jXhVl70nXzmT/WjiYECQQCa\n' +
  'HiKf8GhyAflPmI8sQop/R+xAB0kGpX2Tywqi1LVbe1eCpqwSwuaCf/bSR2llZlLZ\n' +
  '/gw8XPYILqfMmPhQ0ySRAkEAl3dcC+iLuL96xSWuR0MHKVy7R6jY85X33/0eKRc2\n' +
  'DsqVH2fe+HyfhVcFvuP/26j/ilMGTFpPF57aEutLgZU4Tw==\n' +
  '-----END RSA PRIVATE KEY-----'
var defaultTLSServerConfig = {
  'cert' : defaultCert,
  'key' : defaultKey
}

var app = express();
app.use(urlrewrite());
app.use(context(ctx_config));
app.use(analytics({}));
app.use(preflow({}));
app.use(assembly({policies : policies.getPolicies()}));
app.use(postflow());
app.use(errhandler());

//need to monkey patch the HttpParser for the socket.bytesRead
var mkPatch = analytics.mkPatch;
var kOnExecute = process.binding('http_parser').HTTPParser.kOnExecute;

var server;
exports.start = function(port) {
  return new Promise(function(resolve, reject) {
    ds.start(process.env.NODE_ENV === 'production')
      .then(function(useHttps) {
        logger.debug ('starting gateway ', port);
        if (process.env.TLS_SERVER_CONFIG) { // don't care the value, if it's set, we assume HTTPS
          // Load the configuration file
          var stats = fs.statSync(process.env.TLS_SERVER_CONFIG);
          if (!stats.isFile())
            throw new Errror('Invalid TLS server configuration file');
          var options = JSON.parse(fs.readFileSync(process.env.TLS_SERVER_CONFIG));

          // manipulate options content
          var dirname = path.dirname(process.env.TLS_SERVER_CONFIG);
          var filesToRead = ['pfx', 'key', 'cert', 'ca', 'dhparam', 'ticketKeys'];
          filesToRead.forEach(function (file) {
            if(options[file]) {
              if(Array.isArray(options[file])) { // ca is capable of being an array
                for(var i = 0; i < options[file].length; i++) {
                  try {
                    var potentialFile = path.join(dirname, options[file][i]);
                    stats = fs.statSync(potentialFile);
                    if (stats.isFile()) {
                      options[file][i] = fs.readFileSync(potentialFile);
                    }
                  } catch(e) {}
                }
              }
              else {
                try {
                  var potentialFile = path.join(dirname, options[file]);
                  stats = fs.statSync(potentialFile);
                  if (stats.isFile()) {
                    options[file] = fs.readFileSync(potentialFile);
                  }
                } catch(e) {}
              }
            }
          });

          // let's finally create the server
          server = https.createServer(options, app).listen(port, function() {
            logger.debug('micro-gateway listening on port %d', port);
            resolve();
          });
        } else if (useHttps) { // laptop environment where at least one API uses HTTPS
          server = https.createServer(defaultTLSServerConfig, app).listen(port, function() {
            logger.debug('micro-gateway listening on port %d', port);
            resolve();
          });
        } else {
          server = app.listen(port, function() {
            logger.debug('micro-gateway listening on port %d', port);
            resolve();
          });
        }
        if (mkPatch) {
          server.on('connection', function(socket) {
            var parser = socket.parser;
            if (parser) {
              var origExecute = parser[kOnExecute];
              socket._bytesRead = 0;
              parser[kOnExecute] = function(ret, d) {
                parser.socket._bytesRead += ret;
                origExecute(ret,d);
              }
            }
          });
        }
      })
      .then(function () {
        // Node's HTTP library defaults to a 2-minute timeout, but needs to be increased to support 2-minute timeouts
        // for maintain parity with DataPower's Basic Auth with Auth URLs
        server.setTimeout(125000);
      })
      .catch(function(err) {
        logger.debug('micro-gateway failed to start: ', err);
        reject(err);
      });
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    ds.stop()
      .then(function() {
        server.close(function() {
          resolve();
        });
      })
      .catch(reject);
  });
};

exports.app = app;

if (require.main === module) {
  exports.start(5000).
    then(function() {
      logger.debug('micro-gateway listening on port 5000');
    });
}

var ctx_config = {
  request: {
    'contentTypeMaps': [
      {'application/json': ['*/json', '+json', '*/javascript']},
      {'application/xml': ['*/xml', '+xml']}
    ],
    'bodyFilter': {
      'DELETE': 'reject',
      'GET': 'reject',
      'HEAD': 'reject',
      'OPTIONS': 'ignore'
    }
  },
  system: {
    'datetimeFormat': 'YYYY-MM-DDTHH:mm:ssZ',
    'timezoneFormat': 'Z'
  }
};
