'use strict';

let _ = require('lodash');
let assert = require('assert');
let supertest = require('supertest');
let yaml = require('yamljs');

let mg = require('../lib/microgw');

describe('Context variables in laptop experience', function() {

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
    mg.stop()
      .then(done, done)
      .catch(done);
    delete process.env.CONFIG_DIR;
    delete process.env.NODE_ENV;
  });

  it('should produce all $(api) context variables', function(done) {
    request
      .get('/v1/context/api')
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
          document: swagger,
          endpoint: {
            address: '*',
            hostname: 'localhost'
          },
          //id: 'context:1.0.0',
          //method: 'GET',
          name: 'context',
          org: {},
          //path: '/context/api',
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
      .get('/v1/context/internal')
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
            'application/json',
            'application/xml',
            'application/x-www-form-urlencoded'
          ],
          operation: 'GET',
          operationId: 'getInternal',
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
            'application/json',
            'application/xml'
          ],
          responses: {
            '200': {
              description: '200 OK'
            }
          }
        });
        done();
      });
  });

  it('should produce path/query/header request.parameters', function(done) {
    request
      .get('/v1/context/request/parameters/abc/9999?param1=value1&param2=8888&param5=1111&paramBoolean=false&queryArray=1&queryArray=2&queryArray=3')
      .set('X-foo', 'bar')
      .set('X-paramArray', '1024 2048 4096')
      .set('X-expireDate', '1995-12-17T03:24:00 Z')
      .set('X-param7', '{"a": 1234, "b": true}')
      .expect(200)
      .end(function(err, res) {
        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        console.log('request.parameters result: '+JSON.stringify(result));
        assert.deepStrictEqual(result,
            {param1:'value1',
             param2:8888,
             param3:9999,
             param4:'abc',
             'X-foo':'bar',
             paramBoolean:false,
             'X-paramArray':[1024,2048,4096],
             queryArray:['1', '2', '3'],
             'X-expireDate':'1995-12-17T03:24:00.000Z',
             'X-param7': {"a":1234,"b":true}}
        );
        assert.equal(result.param5, undefined);
        assert.equal(result.param6, undefined);
        done();
      });
  });

  it('should produce formData request.parameters', function(done) {
    request
      .post('/v1/context/request/parameters/abc/9999')
      .type('form')
      .set('param4', 2222)
      .send({param2: 8888})
      .send({param1: 'value1'})
      .end(function(err, res) {
        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        console.log('request.parameters result: '+JSON.stringify(result));
        assert.deepStrictEqual(result,
            {param1:'value1',
             param2:8888,
             param3:9999,
             param4:2222}
        );
        done();
      });
  });

  it('should produce body request.parameters', function(done) {
    var payload = 'hello world';
    request
      .put('/v1/context/request/parameters/abc/9999')
      .type('text/plain')
      .set('param4', 4444)
      .send(payload)
      .end(function(err, res) {
        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        console.log('request.parameters result: '+JSON.stringify(result));
        assert.deepStrictEqual(result,
            {param1:payload,
             param3:9999,
             param4:4444}
        );
        done();
      });
  });

  it('should resolve JSON-references', function(done) {
    request
      .get('/v1/context/request/parameters/abc/9999?param1=value1&param2=8888&param5=1111&paramBoolean=false&queryArray=1&queryArray=2&queryArray=3&paramRef1=foo')
      .set('X-foo', 'bar')
      .set('X-paramArray', '1024 2048 4096')
      .set('X-PARAM-REF-2', true)
      .expect(200)
      .end(function(err, res) {
        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        console.log('request.parameters result: '+JSON.stringify(result));
        assert.deepStrictEqual(result,
            {param1:'value1',
             param2:8888,
             param3:9999,
             param4:'abc',
             'X-foo':'bar',
             paramBoolean:false,
             'X-paramArray':[1024,2048,4096],
             queryArray:['1','2','3'],
             paramRef1: 'foo',
             'X-PARAM-REF-2': true }
        );
        assert.equal(result.param5, undefined);
        done();
      });
  });

  it('should copy $(api.properties.*) to context root level', function(done) {
    request
      .get('/v1/context?name=foo')
      .expect(200)
      .end(function(err, res) {
        assert.deepStrictEqual(res.body, {
          name: 'foo',
          value: 'default_foo'
        });
        done();
      });
  });

  describe('should parse body according to API consumes', function() {
    var http = require('http');
    function postData(payloadBuff, callback) {
      var options = {
        hostname: 'localhost',
        port: 3000,
        path: '/v1/context/body-parse',
        method: 'POST',
        headers: {
          'Content-Length': payloadBuff.length
        }
      };
      var req = http.request(options, (res) => {
        var responseData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          callback(undefined, responseData);
        });
      });

      req.on('error', (e) => {
        callback(e, undefined);
      });

      req.write(payloadBuff);
      req.end();
    }

    it('parse as JSON', function(done) {
      var dataString = JSON.stringify({ hello: 'world'}, undefined, 4);
      var dataInBuffer = new Buffer(dataString);
      postData(dataInBuffer, function(error, response) {
        if (error) throw error;
        // the data that we sent is a beautified JSON containing indent
        // expect the gateway parse payload as JSON, and stringify w/o indent
        assert.strictEqual(response, JSON.stringify(JSON.parse(dataString)));
        done();
      });
    });

    it('parse as String', function(done) {
      var dataString = '<hello>world</hello>';
      var dataInBuffer = new Buffer(dataString);
      postData(dataInBuffer, function(error, response) {
        if (error) throw error;
        // expect the gateway JSON.stringify the string,
        // therefore there should be double quotes
        assert.strictEqual(response, '"'+dataString+'"');
        done();
      });
    });

  });


});
