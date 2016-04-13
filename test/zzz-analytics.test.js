// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*eslint-env node, mocha*/
'use strict';

var supertest  = require('supertest');
var microgw;
var backend    = require('./support/invoke-server');
var apimServer = require('./support/mock-apim-server/apim-server');
var analytics  = require('./support/analytics-server');

describe('analytics + invoke policy', function() {

  var request;
  before(function(done)  {
    //Use production instead of CONFIG_DIR: reading from apim instead of laptop
    process.env.NODE_ENV = 'production';

    //The apim server and datastore
    process.env.APIMANAGER = '127.0.0.1';
    process.env.APIMANAGER_PORT = 8081;
    process.env.DATASTORE_PORT = 5000;
    delete require.cache[require.resolve('../lib/microgw')];
    microgw = require('../lib/microgw');
    
    apimServer.start(
            process.env.APIMANAGER,
            process.env.APIMANAGER_PORT,
            __dirname + '/definitions/invoke')
    .then(function() { return backend.start(8889); })
    .then(function() { return analytics.start(9443); })
    .then(function() { return microgw.start(3000); })
    .then(function() {
      request = supertest('http://localhost:3000');
    })
    .then(done)
    .catch(function(err) {
      console.error(err);
      done(err);
    });
  });

  after(function(done) {
    delete process.env.NODE_ENV;
    delete process.env.APIMANAGER;
    delete process.env.APIMANAGER_PORT;
    delete process.env.DATASTORE_PORT;

    apimServer.stop()
    .then(function() { return microgw.stop(); })
    .then(function() { return backend.stop(); })
    .then(function() { return analytics.stop(); })
    .then(done, done)
    .catch(done);
  });

  var data = { msg: 'Hello world' };

  //invoke policy to post a request
  it('single record', function(done) {
    this.timeout(10000);

    //pass the done cb to analytics moc server
    analytics.setOneTimeDoneCB(function (event) {
      //may check the payload if needed
      event = event || '';
      var records = event.trim().split("\n").filter(function(item) {
        if (item && item.length === 0) {
          return false;
        }
        return true;
      });
      done(records.length === 2 ? 
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
  
  it('multiple records', function(done) {
    this.timeout(10000);

    //pass the done cb to analytics moc server
    analytics.setOneTimeDoneCB(function (event) {
      //may check the payload if needed
      event = event || '';
      var records = event.trim().split("\n").filter(function(item) {
        if (item && item.length === 0) {
          return false;
        }
        return true;
      });
      done(records.length >= 3 ? 
        undefined : new Error('record number mismatched'));
    });

    //send multiple requests below
    //suppose it should send multiple apievent records to x2020
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
