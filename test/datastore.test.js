// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var echo = require('./support/echo-server');
var supertest = require('supertest');
var microgw = require('../lib/microgw');
var apimServer = require('./support/mock-apim-server/apim-server');
var dsc = require('../datastore/client/index.js');
var glob = require('glob');
var touch = require('touch');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

describe('data-store', function() {
  var request;
  var snapshotID, oldSnapshotID;
  before(function(done) {
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8890;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_REFRESH_INTERVAL = 15 * 1000; // 15 seconds
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
    echo.start(8889)
      .then(function() { return apimServer.start('127.0.0.1', 8890); })
      .then(function() { return microgw.start(3000); })
      .then(function() {
        request = supertest('http://localhost:5000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanupFile();
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_PORT;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_REFRESH_INTERVAL;
    delete process.env.NODE_ENV;
    microgw.stop()
      .then(function() { echo.stop(); })
      .then(function() { apimServer.stop(); })
      .then(done, done)
      .catch(done);
  });

  function verifyResponseArray(res, expected) {
    assert.strictEqual(res.length, expected.length);
    var current = -1;
    var usedvalues = new Array(res.length);
    _.fill(usedvalues, false);

    for (var i = 0; i < expected.length; i++) {
      var expect = expected[i];
      for (var j = 0; j < res.length; j++) {
        if (usedvalues[j] === true) {
          continue;
        }
        if (_.isMatch(res[j], expect)) {
          var actual = res[j];
          usedvalues[j] = true;
          for (var prop in expect) {
            if (expect.hasOwnProperty(prop)) {
              assert.strictEqual(actual[prop], expect[prop]);
            }
          }
          if (current === -1 && actual.current === true) {
            current = j;
          }
        }
      }
    }
    for (var k = 0; k < usedvalues.length; k++) {
      assert(usedvalues[k] === true);
    }
    return current;
  }

  function verifyResponseSingle(res, expected) {
    for (var prop in expected) {
      if (expected.hasOwnProperty(prop)) {
        assert.strictEqual(res[prop], expected[prop]);
      }
    }
  }

  it('snapshots should have single current entry with ref count of 1',
    function(done) {
      var expect = [ { refcount: '1', current: true } ];
      request
        .get('/api/snapshots')
        .expect(function(res) {
          verifyResponseArray(res.body, expect);
          snapshotID = res.body[0].id;
          assert(snapshotID.length === 5); // ID's are strings of 5 characters
          assert(parseInt(snapshotID, 10) >= 0); // ID's are >= 0
          assert(parseInt(snapshotID, 10) < 65536); // ID's are < 65536
        })
        .end(done);
    });

  it('current should return current snapshot and increment ref count',
    function(done) {
      var expect = { refcount: '2', current: true };
      request
        .get('/api/snapshots/current')
        .expect(function(res) {
          verifyResponseSingle(res.body.snapshot, expect);
          assert.strictEqual(res.body.snapshot.id, snapshotID); // ID should be same as previous
        })
        .end(done);
    });

  it('current should return current snapshot and increment ref count again',
    function(done) {
      var expect = { refcount: '3', current: true };
      request
        .get('/api/snapshots/current')
        .expect(function(res) {
          verifyResponseSingle(res.body.snapshot, expect);
          assert.strictEqual(res.body.snapshot.id, snapshotID); // ID should be same as previous
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }
          apimServer.stop(); // down server shouldn't prevent us from working
          setTimeout(
            done,
            20000 // 15 seconds to ensure second snapshot begins
          );
        });
    });

  it('snapshots should have two entries with previous entry no longer current',
    function(done) {
      var expect = [ { refcount: '2', current: false }, // ref count decreased AND
                                                      // no longer current
                    { refcount: '1', current: true } ];
      request
        .get('/api/snapshots')
        .expect(function(res) {
          var curr = verifyResponseArray(res.body, expect);
          var old = curr > 0 ? 0 : 1;
          oldSnapshotID = snapshotID;
          snapshotID = res.body[curr].id;
          assert(res.body[old].id === oldSnapshotID);
          assert(oldSnapshotID !== snapshotID);
          assert(snapshotID.length === 5); // ID's are strings of 5 characters
          assert(parseInt(snapshotID, 10) >= 0); // ID's are >= 0
          assert(parseInt(snapshotID, 10) < 65536); // ID's are < 65536
        })
        .end(done);
    });

  it('apimGetDefaultCatalog should return catalog from previous apim pull instead of config/default',
    function(done) {
      dsc.apimGetDefaultCatalog(snapshotID, 'apimtest')
        .then(function(cat) {
          if (cat) {
            done();
          } else {
            done(new Error('Did not find catalog'));
          }
        })
        .catch(function(err) { done(err); });
    });

  it('release should return old snapshot and decrement ref count',
    function(done) {
      var expect = { refcount: '1', current: false };
      request
        .get('/api/snapshots/release?id=' + oldSnapshotID)
        .expect(function(res) {
          verifyResponseSingle(res.body.snapshot, expect);
          assert(res.body.snapshot.id === oldSnapshotID); // ID should be same as previous
        })
        .end(done);
    });

  it('release should remove old snapshot and decrement ref count and cleanup dir',
    function(done) {
      var expect = { snapshot: {} };
      request
        .get('/api/snapshots/release?id=' + oldSnapshotID)
        .expect(function(res) {
          assert(_.isEqual(expect, res.body));
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }
          setTimeout(
            function() {
              // check for non existence of directory
              try {
                fs.statSync(path.resolve(__dirname, '../config', oldSnapshotID));
              } catch (e) {
                if (e.code === 'ENOENT') {
                  return done(); // expected
                }
              }
              done(new Error('Snapshot directory still exists'));
            },
            1500 // 1.5 seconds to cleanup
          );
        });
    });

  it('release should remove current snapshot and decrement ref count and cleanup dir',
    function(done) {
      var expect = { snapshot: {} };
      request
        .get('/api/snapshots/release?id=' + snapshotID)
        .expect(function(res) {
          assert(_.isEqual(expect, res.body));
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }
          setTimeout(
            function() {
              // check for non existence of directory
              try {
                fs.statSync(path.resolve(__dirname, '../config', snapshotID));
              } catch (e) {
                if (e.code === 'ENOENT') {
                  return done(); // expected
                }
              }
              done(new Error('Snapshot directory still exists'));
            },
            1500 // 1.5 seconds to cleanup
          );
        });
    });
});

describe('data-store restart', function() {
  var request;
  var snapshotID;
  before(function(done) {
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8890;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_REFRESH_INTERVAL = 15 * 1000; // 15 seconds
    process.env.NODE_ENV = 'production';
    echo.start(8889)
      .then(function() { return apimServer.start('127.0.0.1', 8890); })
      .then(function() { return microgw.start(3000); })
      .then(function() {
        request = supertest('http://localhost:5000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanupFile();
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_PORT;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_REFRESH_INTERVAL;
    delete process.env.NODE_ENV;
    microgw.stop()
      .then(function() { echo.stop(); })
      .then(function() { apimServer.stop(); })
      .then(done, done)
      .catch(done);
  });

  function verifyResponseArray(res, expected) {
    assert.strictEqual(res.length, expected.length);
    var current = -1;
    var usedvalues = new Array(res.length);
    _.fill(usedvalues, false);

    for (var i = 0; i < expected.length; i++) {
      var expect = expected[i];
      for (var j = 0; j < res.length; j++) {
        if (usedvalues[j] === true) {
          continue;
        }
        if (_.isMatch(res[j], expect)) {
          var actual = res[j];
          usedvalues[j] = true;
          for (var prop in expect) {
            if (expect.hasOwnProperty(prop)) {
              assert.strictEqual(actual[prop], expect[prop]);
            }
          }
          if (current === -1 && actual.current === true) {
            current = j;
          }
        }
      }
    }
    for (var k = 0; k < usedvalues.length; k++) {
      assert(usedvalues[k] === true);
    }
    return current;
  }

  it('snapshots should have single current entry with ref count of 1',
    function(done) {
      var expect = [ { refcount: '1', current: true } ];
      request
        .get('/api/snapshots')
        .expect(function(res) {
          verifyResponseArray(res.body, expect);
          snapshotID = res.body[0].id;
          assert(snapshotID.length === 5); // ID's are strings of 5 characters
          assert(parseInt(snapshotID, 10) >= 0); // ID's are >= 0
          assert(parseInt(snapshotID, 10) < 65536); // ID's are < 65536
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }
          microgw.stop()
            .then(done, done)
            .catch(done);
        });
    });

  it('snapshots should have single current entry with ref count of 1',
    function(done) {
      microgw.start(3000)
        .then(function() {
          var expect = [ { refcount: '1', current: true } ];
          request
            .get('/api/snapshots')
            .expect(function(res) {
              verifyResponseArray(res.body, expect);
              var tmpSnapshotID = res.body[0].id;
              assert(tmpSnapshotID !== snapshotID);
              assert(tmpSnapshotID.length === 5); // ID's are strings of 5 characters
              assert(parseInt(tmpSnapshotID, 10) >= 0); // ID's are >= 0
              assert(parseInt(tmpSnapshotID, 10) < 65536); // ID's are < 65536
              try {
                fs.statSync(path.resolve(__dirname, '../config', snapshotID));
                assert(false);
              } catch (e) {
                if (e.code !== 'ENOENT') {
                  assert(false);
                }
              }
              snapshotID = tmpSnapshotID;
            })
            .end(function(err, res) {
              if (err) {
                return done(err);
              }
              microgw.stop()
                .then(function() { apimServer.stop(); })
                .then(done, done)
                .catch(done);
            });
        })
        .catch(done);
    });

  it('snapshot should not have changed on restart',
    function(done) {
      microgw.start(3000)
        .then(function() {
          var expect = [ { refcount: '1', current: true } ];
          request
            .get('/api/snapshots')
            .expect(function(res) {
              verifyResponseArray(res.body, expect);
              assert(res.body[0].id === snapshotID);
            })
            .end(done);
        })
        .catch(done);
    });

  it('release should remove current snapshot and decrement ref count and cleanup dir',
    function(done) {
      var expect = { snapshot: {} };
      request
        .get('/api/snapshots/release?id=' + snapshotID)
        .expect(function(res) {
          assert(_.isEqual(expect, res.body));
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }
          setTimeout(
            function() {
              // check for non existence of directory
              try {
                fs.statSync(path.resolve(__dirname, '../config', snapshotID));
              } catch (e) {
                if (e.code === 'ENOENT') {
                  return done(); // expected
                }
              }
              done(new Error('Snapshot directory still exists'));
            },
            1500 // 1.5 seconds to cleanup
          );
        });
    });
});

describe('data-store-retry', function() {
  var request;
  before(function(done) {
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8890;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.CONFIG_DIR = __dirname + '/definitions/datastore';
    process.env.NODE_ENV = 'production';
    done();
  });

  after(function(done) {
    dsCleanupFile();
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_PORT;
    delete process.env.APIMANAGER;
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    done();
  });

  it('snapshots should be empty and microgateway should not be started',
    function(done) {
      microgw.start(3000)
        .then(function() {
          assert(false);
        })
        .then(done)
        .catch(function(err) {
          done(err);
        });

      request = supertest('http://localhost:5000');
      setTimeout(
        function() {
          request
            .get('/api/snapshots')
            .expect(200, [])
            .end(function(err, res) {
              if (err) { /* suppress eslint handle-callback-err */ }
              microgw.stop()
                .then(done, done)
                .catch(done);
            });
        },
        10000 /* 10s */);
    });

  it('snapshots should be empty and microgateway should not be started',
    function(done) {
      microgw.start(3000)
        .then(function() {
          assert(false);
        })
        .then(done)
        .catch(function(err) {
          done(err);
        });

      request = supertest('http://localhost:5000');
      setTimeout(
        function() {
          request
            .get('/api/snapshots')
            .expect(200, [])
            .end(function(err, res) {
              if (err) { /* suppress eslint handle-callback-err */ }
              microgw.stop()
                .then(done, done)
                .catch(done);
            });
        },
        10000 /* 10s */);
    });
});

describe('data-store-etags', function() {
  var request;
  var snapshotID, oldSnapshotID;
  var snapshotDirStats;
  before(function(done) {
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8890;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_REFRESH_INTERVAL = 15 * 1000; // 15 seconds
    process.env.NODE_ENV = 'production';
    echo.start(8889)
      .then(function() { return apimServer.start('127.0.0.1', 8890); })
      .then(function() { return microgw.start(3000); })
      .then(function() {
        request = supertest('http://localhost:5000');
      })
      .then(done)
      .catch(function(err) {
        console.error(err);
        done(err);
      });
  });

  after(function(done) {
    dsCleanupFile();
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_PORT;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_REFRESH_INTERVAL;
    delete process.env.NODE_ENV;
    microgw.stop()
      .then(function() { echo.stop(); })
      .then(function() { apimServer.stop(); })
      .then(done, done)
      .catch(done);
  });

  function verifyResponseArray(res, expected) {
    assert.strictEqual(res.length, expected.length);
    var current = -1;
    var usedvalues = new Array(res.length);
    _.fill(usedvalues, false);

    for (var i = 0; i < expected.length; i++) {
      var expect = expected[i];
      for (var j = 0; j < res.length; j++) {
        if (usedvalues[j] === true) {
          continue;
        }
        if (_.isMatch(res[j], expect)) {
          var actual = res[j];
          usedvalues[j] = true;
          for (var prop in expect) {
            if (expect.hasOwnProperty(prop)) {
              assert.strictEqual(actual[prop], expect[prop]);
            }
          }
          if (current === -1 && actual.current === true) {
            current = j;
          }
        }
      }
    }
    for (var k = 0; k < usedvalues.length; k++) {
      assert(usedvalues[k] === true);
    }
    return current;
  }

  it('snapshots should have single current entry with ref count of 1',
    function(done) {
      var expect = [ { refcount: '1', current: true } ];
      request
        .get('/api/snapshots')
        .expect(function(res) {
          verifyResponseArray(res.body, expect);
          snapshotID = res.body[0].id;
          assert(snapshotID.length === 5); // ID's are strings of 5 characters
          assert(parseInt(snapshotID, 10) >= 0); // ID's are >= 0
          assert(parseInt(snapshotID, 10) < 65536); // ID's are < 65536
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          try {
            touch.sync(__dirname + '/support/mock-apim-server/v1/catalogs/index.html', {});
          } catch (e) {
            done(e);
            return;
          }

          glob(__dirname + '/../config/' + snapshotID + '/*.json',
            function(err, files) {
              if (err) {
                return done(err);
              }

              for (var i = 0, len = files.length; i < len; i++) {
                var stat = fs.statSync(files[i]);
                files[i] = { name: files[i], stat: stat };
              }

              snapshotDirStats = files;
              setTimeout(
                done,
                20000 // 15 seconds to ensure second snapshot begins
              );
            });
        });
    });

  it('snapshots should have one entry with previous entry no longer there',
    function(done) {
      var expect = [ { refcount: '1', current: true } ];
      request
        .get('/api/snapshots')
        .expect(function(res) {
          verifyResponseArray(res.body, expect);
          oldSnapshotID = snapshotID;
          snapshotID = res.body[0].id;
          assert(oldSnapshotID !== snapshotID);
          assert(snapshotID.length === 5); // ID's are strings of 5 characters
          assert(parseInt(snapshotID, 10) >= 0); // ID's are >= 0
          assert(parseInt(snapshotID, 10) < 65536); // ID's are < 65536
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          glob(__dirname + '/../config/' + snapshotID + '/*.json',
            function(err, files) {
              if (err) {
                return done(err);
              }

              for (var i = 0, len = files.length; i < len; i++) {
                var mystat = fs.statSync(files[i]);
                files[i] = { name: files[i], stat: mystat };
              }

              // ensure catalogs is only updated file due to ETag difference
              assert(files.length === snapshotDirStats.length);
              for (i = 0, len = files.length; i < len; i++) {
                var filename = path.basename(files[i].name);
                var regex = new RegExp('^catalogs-.+\.json$');
                var j = 0;
                var jlen = snapshotDirStats.length;
                for (; j < jlen; j++) {
                  var jfilename = path.basename(snapshotDirStats[j].name);
                  if (regex.exec(filename)) {
                    assert(jfilename !== filename);
                    if (regex.exec(jfilename)) {
                      assert(files[i].stat.mtime.toString() !== snapshotDirStats[j].stat.mtime.toString());
                      break;
                    }
                  } else if (jfilename === filename) {
                    assert(files[i].stat.mtime.toString() === snapshotDirStats[j].stat.mtime.toString());
                    break;
                  }
                }
                assert(j !== jlen);
              }

              done();
            });
        });
    });

  it('release should remove current snapshot and decrement ref count and cleanup dir',
    function(done) {
      var expect = { snapshot: {} };
      request
        .get('/api/snapshots/release?id=' + snapshotID)
        .expect(function(res) {
          assert(_.isEqual(expect, res.body));
        })
        .end(function(err, res) {
          if (err) {
            return done(err);
          }

          setTimeout(
            function() {
              // check for non existence of directory
              try {
                fs.statSync(path.resolve(__dirname, '../config', snapshotID));
              } catch (e) {
                if (e.code === 'ENOENT') {
                  return done(); // expected
                }
              }
              done(new Error('Snapshot directory still exists'));
            },
            1500 // 1.5 seconds to cleanup
          );
        });
    });

});

