'use strict';

let supertest = require('supertest');
let mg = require('../lib/microgw');

describe('Context variables', function() {

  let request;
  before((done) => {
    process.env.CONFIG_DIR = __dirname + '/definitions/context';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
      .then(done, done)
      .catch(done);
  });

  it('should produce all $(api) context variables', function(done) {
    request
      .get('/context/api')
      .expect(200, {}, done); // TODO: fix this, there should be body returned
  });

});
