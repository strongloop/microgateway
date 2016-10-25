// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var apimServer = require('./support/mock-apim-server/apim-server');
var dsCleanup = require('./support/utils').dsCleanup;
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

var mg = require('../lib/microgw');

describe('HTTP and HTTPS in onprem in separate files', function() {

  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/combined1';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;

    resetLimiterCache();
    apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        process.env.CONFIG_DIR)
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    apimServer.stop()
      .then(done, done)
      .catch(done);
  });

  it('should expect failure to load', function(done) {
    mg.start(3000)
      .catch(function(err) {
        if (err) {
          dsCleanupFile();
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

describe('HTTP and HTTPS in onprem in same file', function() {

  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/combined2';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    apimServer.start(
        process.env.APIMANAGER,
        process.env.APIMANAGER_PORT,
        process.env.CONFIG_DIR)
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    apimServer.stop()
      .then(done, done)
      .catch(done);
  });

  it('should expect failure to load', function(done) {
    mg.start(3000)
      .catch(function(err) {
        if (err) {
          dsCleanupFile();
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

describe('HTTPS in onprem w/ env var', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.TLS_SERVER_CONFIG = __dirname + '/support/https/tlsconfig.json';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.TLS_SERVER_CONFIG;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

describe('HTTPS in onprem w/ pfx', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.TLS_SERVER_CONFIG = __dirname + '/support/https/tlsconfig-pfx.json';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.TLS_SERVER_CONFIG;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

describe('HTTPS in onprem w/ default TLS', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

describe('HTTP in onprem when HTTPS not specified', function() {
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });

});

describe('HTTPS in onprem when HTTPS explicitly specified', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

describe('HTTPS in onprem when schemes not specified', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start(3000);
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});

/*  NEED ROOT ACCESS
describe('HTTP no port specified in onprem when HTTPS not specified', function() {
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start();
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        httprequest = supertest('http://localhost:80');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });
});
*/

describe('HTTP port in ENV in onprem when HTTPS not specified', function() {
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    process.env.PORT = 3000;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start();
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });

});

/*  NEED ROOT ACCESS
describe('HTTPS no port specified in onprem when HTTPS explicitly specified', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start();
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:443');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});
*/

describe('HTTPS port in ENV in onprem when HTTPS explicitly specified', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.PORT = 3000;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            process.env.CONFIG_DIR)
      .then(function() {
        return mg.start();
      })
      .then(function() {
        return echo.start(8889);
      })
      .then(function() {
        request = supertest(mg.app);
        httprequest = supertest('http://localhost:3000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanup(5000)
      .then(function() { return mg.stop(); })
      .then(function() { return apimServer.stop(); })
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.APIMANAGER;
    delete process.env.APIMAMANGER_PORT;
    delete process.env.DATASTORE_PORT;
  });

  it('should expect success', function(done) {
    request
      .get('/https/https')
      .expect(200, done);
  });

  it('should expect failure', function(done) {
    httprequest
      .get('/http/http')
      .end(function(err, res) {
        if (err) {
          return done(); // expect error
        }
        done(new Error('expect error'));
      });
  });

});
