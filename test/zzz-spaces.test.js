// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*eslint-env node, mocha*/
'use strict';

var supertest = require('supertest');
var Promise = require('bluebird');
var microgw;
var backend = require('./support/invoke-server');
var analytics = require('./support/analytics-server');
var fs = require('fs');
var path = require('path');
var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

var hasCopiedKeys;
var privKey = path.resolve(__dirname, '..', 'id_rsa');
var pubKey = path.resolve(__dirname, '..', 'id_rsa.pub');
var srcPrivKey = path.resolve(__dirname, 'definitions',
         'analytics', 'id_rsa');
var srcPubKey = path.resolve(__dirname, 'definitions',
        'analytics', 'id_rsa.pub');


function copyKeys() {
  return new Promise(function(resolve, reject) {
    try {
      var fsStat1 = fs.statSync(privKey);
      var fsStat2 = fs.statSync(pubKey);
      if (fsStat1.isFile() && fsStat2.isFile()) {
        resolve();
        hasCopiedKeys = undefined;
        return;
      }
    } catch (e) {}

    try {
      //need to copy keys
      var buf1 = fs.readFileSync(srcPrivKey);
      var buf2 = fs.readFileSync(srcPubKey);
      fs.writeFileSync(privKey, buf1);
      fs.writeFileSync(pubKey, buf2);
      hasCopiedKeys = 1;
      resolve();
    } catch (e) {
      reject(new Error('unable to prepare keys:' + e));
    }
  });
}

function delKeys() {
  return new Promise(function(resolve, reject) {
    if (!hasCopiedKeys) {
      resolve();
    } else {
      try {
        fs.unlinkSync(privKey);
        fs.unlinkSync(pubKey);
        resolve();
      } catch (e) {
        reject(new Error('unable to delete keys:' + e));
      }
    }
  });
}

describe('analytics + invoke policy', function() {

  var request;
  before(function(done) {
    //Use production instead of CONFIG_DIR: reading from apim instead of laptop
    process.env.NODE_ENV = 'production';
    process.env.CONFIG_DIR = __dirname + '/definitions/default';

    //The apim server and datastore
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.APIMANAGER_CATALOG = '564b48aae4b0869c782edc2b';
    process.env.DATASTORE_PORT = 5000;
    delete require.cache[require.resolve('../lib/microgw')];

    resetLimiterCache();
    copyKeys()
    .then(function() {
      return analytics.start(
            process.env.APIMANAGER_PORT,
            __dirname + '/definitions/spaces/v1');
    })
    .then(function() { return backend.start(8889); })
    .then(function() {
      microgw = require('../lib/microgw');
      return microgw.start(3000);
    })
    .then(function() {
      request = supertest('http://localhost:3000');
    })
    .then(done)
    .catch(function(err) {
      console.error('preparation failed:', err);
      done(err);
    });
  });

  after(function(done) {
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_PORT;
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_CATALOG;

    analytics.stop()
    .then(function() { return dsCleanup(5000); })
    .then(function() { return microgw.stop(); })
    .then(function() { return backend.stop(); })
    .then(function() { return delKeys(); })
    .then(done, done)
    .catch(done);
  });

  var data = { msg: 'Hello world' };

  //invoke policy to post a request
  it('single record', function(done) {
    this.timeout(10000);

    //pass the done cb to analytics moc server
    analytics.setOneTimeDoneCB(function(event) {
      //may check the payload if needed
      event = event || '';
      var records = event.trim().split('\n').filter(function(item) {
        if (item && item.length === 0) {
          return false;
        }
        return true;
      });
      done(records.length === 2 && JSON.parse(records[1]).spaceId.length === 1 ?
        undefined : new Error('record number mismatched'));
    });

    request
      .post('/invoke/basic')
      .send(data)
      .expect(200, /z-url: \/\/invoke\/basic/)
      .end(function(err) {
        if (err) {
          //no need to wait for the analytics moc server
          done(err);
        }
      });
  });

});
