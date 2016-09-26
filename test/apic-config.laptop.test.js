// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var supertest = require('supertest');
var mg = require('../lib/microgw');
var backend = require('./support/invoke-server');
var dsCleanupFile = require('./support/utils').dsCleanupFile;

describe('[Dev Experience]', function() {
  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/apic-config';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(function() {
        //API servers: http @8889, https @8890
        return backend.start(8889);
      })
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
    dsCleanupFile();
    mg.stop()
      .then(function() { return backend.stop(); })
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  describe('[apic.json]', function() {
    it('the app foo does subscribe the API bank-account', function(done) {
      request.get('/account/balance')
        .set('X-IBM-Client-Id', 'foo')
        .set('X-IBM-Client-Secret', 'fooSecret')
        .expect(200, /{ "id": "foo", "balance": 23501 }/)
        .end(function(err, res) {
          done(err);
        });
    });

    //the foo fails to fulfill the security requirement
    it('the app foo does not subscribe the API stock-quote', function(done) {
      request.get('/stock/quote')
        .query({ symbol: 'IBM' })
        .set('X-IBM-Client-Id', 'foo')
        .set('X-IBM-Client-Secret', 'fooSecret')
        .expect(401, /unable to process the request/)
        .end(function(err, res) {
          done(err);
        });
    });

    it('the app bar does subscribe the API stock-quote', function(done) {
      request.get('/stock/quote')
        .query({ symbol: 'IBM' })
        .set('X-IBM-Client-Id', 'bar')
        .set('X-IBM-Client-Secret', 'barSecret')
        .expect(200, /{ "IBM": 129 }/)
        .end(function(err, res) {
          done(err);
        });
    });

    //a public API has no security requirement to check
    it('the API weather is public', function(done) {
      request.get('/weather/temperature')
        .expect(200, /{ "temperature": "27C" }/)
        .end(function(err, res) {
          done(err);
        });
    });

    //although 'foo' doesn't subscript the public API 'weather', the request
    //should still be processed.
    it('the app foo can execute the public API weather without subscription', function(done) {
      request.get('/weather/temperature')
        .set('X-IBM-Client-Id', 'foo')
        .set('X-IBM-Client-Secret', 'fooSecret')
        .expect(200, /{ "temperature": "27C" }/)
        .end(function(err, res) {
          done(err);
        });
    });

    it('the app foo calls the API bank-account (rate-limite=1/second) twice', function(done) {
      //wait for one second before testing the rate limit
      setTimeout(
        function() {
          request.get('/account/balance')
            .set('X-IBM-Client-Id', 'foo')
            .set('X-IBM-Client-Secret', 'fooSecret')
            .expect(200, /{ "id": "foo", "balance": 23501 }/)
            .end(function(err1, res) {
              //the request should be rejected when the rate limit is reached
              request.get('/account/balance')
                .set('X-IBM-Client-Id', 'foo')
                .set('X-IBM-Client-Secret', 'fooSecret')
                .expect(429) //too many requests
                .end(function(err2, res) {
                  done(err1 || err2);
                });
            });
        },
        1000);
    });

    //the rate limit is not yet reached
    it('the app bar calls the API stock-quote (rate-limite=100/minute) twice', function(done) {
      request.get('/stock/quote')
        .query({ symbol: 'IBM' })
        .set('X-IBM-Client-Id', 'bar')
        .set('X-IBM-Client-Secret', 'barSecret')
        .expect(200, /{ "IBM": 129 }/)
        .end(function(err1, res) {
          request.get('/stock/quote')
            .query({ symbol: 'IBM' })
            .set('X-IBM-Client-Id', 'bar')
            .set('X-IBM-Client-Secret', 'barSecret')
            .expect(200, /{ "IBM": 129 }/)
            .end(function(err2, res) {
              done(err1 || err2);
            });
        });
    });
  });

  //Configure TLS profiles in apic-tls-profiles.json
  describe('[apic-tls-profiles.json]', function() {
    //invoke with the defined TLS profile
    it('invoke an HTTPs API (w/ a tls-profile)', function(done) {
      request.get('/invoke')
        .expect(200, /z-host: localhost:8890/)
        .end(function(err, res) {
          done(err);
        });
    });
  });

});

