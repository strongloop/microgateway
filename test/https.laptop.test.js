// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var echo = require('./support/echo-server');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var mg = require('../lib/microgw');

require('../lib/rate-limit/util').resetLimiterCache();

describe('HTTP and HTTPS in separate files', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/combined1';
    process.env.NODE_ENV = 'production';
    done();
  });

  after(function(done) {
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    done();
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

describe('HTTP and HTTPS in same file', function() {
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/combined2';
    process.env.NODE_ENV = 'production';
    done();
  });

  after(function(done) {
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    done();
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

describe('HTTPS in laptop experience w/ env var', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.TLS_SERVER_CONFIG = __dirname + '/support/https/tlsconfig.json';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.TLS_SERVER_CONFIG;
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

describe('HTTPS in laptop experience w/ pfx', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.TLS_SERVER_CONFIG = __dirname + '/support/https/tlsconfig-pfx.json';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.TLS_SERVER_CONFIG;
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

describe('HTTPS in laptop experience w/ pfx obfuscated password', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.TLS_SERVER_CONFIG = __dirname + '/support/https/tlsconfig-pfx-obfuscated.json';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.TLS_SERVER_CONFIG;
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


describe('HTTPS in laptop experience w/ default TLS', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
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

describe('HTTP in laptop experience when HTTPS not specified', function() {
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });

});

describe('HTTPS in laptop experience when HTTPS explicitly specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
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

describe('HTTPS in laptop experience when schemes not specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
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
describe('HTTP no port specified in laptop experience when HTTPS not specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    mg.start()
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });

});
*/

describe('HTTP port in ENV in laptop experience when HTTPS not specified', function() {
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/http';
    process.env.NODE_ENV = 'production';
    process.env.PORT = 3000;
    mg.start()
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
  });

  it('should expect success', function(done) {
    httprequest
      .get('/http/http')
      .expect(200, done);
  });

});

/*  NEED ROOT ACCESS
describe('HTTPS no port specified in laptop experience when HTTPS explicitly specified', function() {
  var request;
  var httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    mg.start()
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
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

describe('HTTPS port in ENV in laptop experience when HTTPS explicitly specified', function() {

  var request, httprequest;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/https/httpsexplicit';
    process.env.NODE_ENV = 'production';
    process.env.PORT = 3000;
    mg.start()
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return echo.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
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
