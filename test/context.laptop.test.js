'use strict';

let _ = require('lodash');
let assert = require('assert');
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
      .expect(200)
      .end(function(err, res) {
        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        result.endpoint.address = '*';
        result.document = {}; // no need to verify the swagger content

        assert.deepStrictEqual(result, {
          basepath: '/',
          endpoint: {
            address: '*',
            hostname: 'localhost'
          },
          id: 'context:1.0.0',
          method: 'GET',
          name: 'context',
          operationId: 'getAPI',
          path: '/context/api',
          properties: {
            foo: 'default_foo'
          },
          type: 'REST',
          version: '1.0.0',
          document: {},
          operation: {
            path: '/context/api',
            consumes: [
              'application/xml',
              'application/json'
            ],
            parameters: [
              {
                  description: 'parameter 1',
                  in: 'query',
                  name: 'param1',
                  type: 'string'
              },
              {
                  description: 'parameter 2',
                  in: 'header',
                  name: 'param2',
                  type: 'integer'
              }
            ]
            }
        });
        done();
      });
  });

});
