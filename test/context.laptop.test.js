'use strict';

let _ = require('lodash');
let assert = require('assert');
let supertest = require('supertest');
let yaml = require('yamljs');

let mg = require('../lib/microgw');
let os = require('os');
let copy = require('../utils/copy.js')

describe('Context variables', function() {

  let request;
  before((done) => {
    copy.copyRecursive(__dirname + '/definitions/context', os.tmpdir()+ '/context');
    process.env.CONFIG_DIR = os.tmpdir() + '/context';
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
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    copy.deleteRecursive(os.tmpdir()+ '/context');
    delete process.env.NODE_ENV;
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

        let swagger =
          yaml.load(process.env.CONFIG_DIR + '/context_1.0.0.yaml');

        delete swagger['x-ibm-configuration'].assembly;

        assert.deepStrictEqual(result, {
          basepath: '/',
          document: swagger,
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
          version: '1.0.0'
        });
        done();
      });
  });

  it('should produce all $(_.api) context variables', function(done) {
    request
      .get('/context/internal')
      .expect(200)
      .end(function(err, res) {
        var result = res.body;
        if (_.isString(result)) {
          console.log('parsing JSON');
          result = JSON.parse(result);
        }

        let swagger =
          yaml.load(process.env.CONFIG_DIR + '/context_1.0.0.yaml');

        assert.deepStrictEqual(result, {
          assembly: {
            assembly: swagger['x-ibm-configuration'].assembly
          },
          consumes: [
            'application/xml',
            'application/json'
          ],
          operation: 'GET',
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
          ],
          path: '/context/internal',
          produces: [
            'application/xml',
            'application/json'
          ],
          responses: {
            '200': {
              description: "200 OK"
            }
          }
        });
        done();
      });
  });

});
