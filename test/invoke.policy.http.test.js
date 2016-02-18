'use strict';

let supertest = require('supertest');
let echo = require('./support/echo-server');
let mg = require('../lib/microgw');
let should = require('should');

describe('invoke policy', function() {

  let request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/invoke';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
      .then(() => {
        return echo.start(8889);
      })
      .then(() => {
        request = supertest('http://localhost:3000');
      })
      .then(done)
      .catch((err) => {
        console.error(err);
        done(err);
      });
  });

  after((done) => {
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
    mg.stop()
      .then(() => echo.stop())
      .then(done, done)
      .catch(done);
  });

  it('post', function(done) {
    this.timeout(10000);

    request
      .post('/invoke/path-1')
      .send("aloha amigo")
      .end(function(err, res) {
          //TODO: expect 200
          done();
      });
  });

  it('get', function(done) {
    this.timeout(10000);

    request
      .get('/invoke/path-2')
      .expect(200, done);
  });

  //TODO: Add more testcases ...

});
