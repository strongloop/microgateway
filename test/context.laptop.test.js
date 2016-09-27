// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';

var _ = require('lodash');
var assert = require('assert');
var supertest = require('supertest');
var yaml = require('yamljs');
var dsCleanupFile = require('./support/utils').dsCleanupFile;
var mg = require('../lib/microgw');

describe('Context variables in laptop experience', function() {

  var request;
  before(function(done) {
    process.env.CONFIG_DIR = __dirname + '/definitions/context';
    process.env.NODE_ENV = 'production';
    mg.start(3000)
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
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        result.endpoint.address = '*';

        var swagger =
          yaml.load(process.env.CONFIG_DIR + '/context_1.0.0.yaml');

        delete swagger['x-ibm-configuration'].assembly;

        var expectApi = {
          document: swagger,
          endpoint: {
            address: '*',
            hostname: 'localhost' },
          //id: 'context:1.0.0',
          //method: 'GET',
          name: 'context',
          org: {
            id: 'defaultOrgID',
            name: 'defaultOrgName' },
          operation: {
            path: '/context/api' },
          properties: {
            foo: 'default_foo' },
          type: 'REST',
          state: 'running',
          version: '1.0.0' };

        assert.deepEqual(result, expectApi);
        done();
      });
  });

  it('should produce all $(_.api) context variables', function(done) {
    request
      .get('/v1/context/internal')
      .expect(200)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        var swagger =
          yaml.load(process.env.CONFIG_DIR + '/context_1.0.0.yaml');

        assert.deepEqual(result, {
          assembly: {
            assembly: swagger['x-ibm-configuration'].assembly },
          consumes: [
            'application/json',
            'application/xml',
            'application/x-www-form-urlencoded' ],
          id: 'context:1.0.0', // TODO: check why the id is in this
          operation: 'get',
          operationId: 'getInternal',
          parameters: [
            { description: 'parameter 1',
              in: 'query',
              name: 'param1',
              type: 'string' },
            { description: 'parameter 2',
              in: 'header',
              name: 'param2',
              type: 'integer' } ],
          path: '/context/internal',
          produces: [
            'application/json',
            'application/xml' ],
          responses: {
            200: {
              description: '200 OK' } },
          'subscription-active': true,
          'subscription-app-state': 'ACTIVE' });
        done();
      });
  });

  it('should produce path/query/header request.parameters', function(done) {
    request
      .get('/v1/context/request/parameters/abc/9999?' +
              'param1=value1&param2=8888&param5=1111&paramBoolean=false&' +
              'queryArray=1&queryArray=2&queryArray=3')
      .set('X-foo', 'bar')
      .set('X-paramArray', '1024 2048 4096')
      .set('X-expireDate', '1995-12-17T03:24:00 Z')
      .set('X-param7', '{"a": 1234, "b": true}')
      .expect(200)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, {
          param1: 'value1',
          param2: 8888,
          param3: 9999,
          param4: 'abc',
          'X-foo': 'bar',
          paramBoolean: false,
          'X-paramArray': [ 1024, 2048, 4096 ],
          queryArray: [ '1', '2', '3' ],
          'X-expireDate': '1995-12-17T03:24:00.000Z',
          'X-param7': { a: 1234, b: true } });
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
      .send({ param2: 8888 })
      .send({ param1: 'value1' })
      .end(function(err, res) {
        assert(err === null || err === undefined);

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, {
          param1: 'value1',
          param2: 8888,
          param3: 9999,
          param4: 2222 });
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
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, {
          param1: payload,
          param3: 9999,
          param4: 4444 });
        done();
      });
  });

  it('should produce request.parameters for one match of multiple parts', function(done) {
    var payload = 'hello world';
    request
      .put('/v1/context/request/multi/instance/parameters/abc')
      .type('text/plain')
      .send(payload)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, { param1: [ 'abc' ] });
        done();
      });
  });

  it('should produce request.parameters for two match of multiple parts', function(done) {
    var payload = 'hello world';
    request
      .put('/v1/context/request/multi/instance/parameters/abc/def')
      .type('text/plain')
      .send(payload)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, { param1: [ 'abc', 'def' ] });
        done();
      });
  });

  it('should produce request.parameters for three match of multiple parts', function(done) {
    var payload = 'hello world';
    request
      .put('/v1/context/request/multi/instance/parameters/abc/def/gh')
      .type('text/plain')
      .send(payload)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, { param1: [ 'abc', 'def', 'gh' ] });
        done();
      });
  });


  it('should produce request.parameters for mixed multiple parts', function(done) {
    var payload = 'hello world';
    request
      .put('/v1/context/request/mix/parameters/abc/def/gh')
      .type('text/plain')
      .send(payload)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, {
          param1: 'abc',
          param2: [ 'def', 'gh' ] });
        done();
      });
  });

  it('should resolve JSON-references', function(done) {
    request
      .get('/v1/context/request/parameters/abc/9999?' +
              'param1=value1&param2=8888&param5=1111&paramBoolean=false&' +
              'queryArray=1&queryArray=2&queryArray=3&paramRef1=foo')
      .set('X-foo', 'bar')
      .set('X-paramArray', '1024 2048 4096')
      .set('X-PARAM-REF-2', true)
      .expect(200)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        var result = res.body;
        if (_.isString(result)) {
          result = JSON.parse(result);
        }

        assert.deepEqual(result, {
          param1: 'value1',
          param2: 8888,
          param3: 9999,
          param4: 'abc',
          'X-foo': 'bar',
          paramBoolean: false,
          'X-paramArray': [ 1024, 2048, 4096 ],
          queryArray: [ '1', '2', '3' ],
          paramRef1: 'foo',
          'X-PARAM-REF-2': true });
        assert.equal(result.param5, undefined);
        done();
      });
  });

  it('should copy $(api.properties.*) to context root level', function(done) {
    request
      .get('/v1/context?name=foo')
      .expect(200)
      .end(function(err, res) {
        assert(!err, 'Unexpected error with context unit tests');

        assert.deepEqual(res.body, {
          name: 'foo',
          value: 'default_foo' });
        done();
      });
  });

  describe('should parse payload body', function() {
    var http = require('http');
    function postData(payloadBuff, type, callback) {
      var options = {
        hostname: 'localhost',
        port: 3000,
        path: '/v1/context/body-parse',
        method: 'POST',
        headers: {
          'Content-Length': payloadBuff.length } };

      if (type) {
        options.headers['Content-Type'] = type;
      }

      var req = http.request(options, function(res) {
        var responseData = '';
        res.setEncoding('utf8');
        res.on('data', function(chunk) {
          responseData += chunk;
        });
        res.on('end', function() {
          callback(undefined, res.statusCode, responseData);
        });
      });

      req.on('error', function(e) {
        callback(e, undefined);
      });

      req.write(payloadBuff);
      req.end();
    }

    describe('according to API consumes definition', function() {
      it('parse as JSON', function(done) {
        var dataString = JSON.stringify({ hello: 'world' }, undefined, 4);
        var dataInBuffer = new Buffer(dataString);
        postData(dataInBuffer, undefined, function(error, status, response) {
          if (error) {
            throw error;
          }
          // the data that we sent is a beautified JSON containing indent
          // expect the gateway parse payload as JSON, and stringify w/o indent
          assert.strictEqual(response, JSON.stringify(JSON.parse(dataString)));
          done();
        });
      });

      it('parse as String', function(done) {
        var dataString = '<hello>world</hello>';
        var dataInBuffer = new Buffer(dataString);
        postData(dataInBuffer, undefined, function(error, status, response) {
          if (error) {
            throw error;
          }
          // expect the gateway JSON.stringify the string,
          // therefore there should be double quotes
          assert.strictEqual(response, '"' + dataString + '"');
          done();
        });
      });
    });

    describe('according to request Content-Type header', function() {
      it('parse as JSON', function(done) {
        var dataString = JSON.stringify({ hello: 'world' }, undefined, 4);
        var dataInBuffer = new Buffer(dataString);
        postData(dataInBuffer, 'application/json', function(error, status, response) {
          if (error) {
            throw error;
          }
          // the data that we sent is a beautified JSON containing indent
          // expect the gateway parse payload as JSON, and stringify w/o indent
          assert.strictEqual(response, JSON.stringify(JSON.parse(dataString)));
          done();
        });
      });

      it('return 400 when payload and content-type mismatch', function(done) {
        var dataString = JSON.stringify({ hello: 'world' }, undefined, 4);
        var dataInBuffer = new Buffer(dataString + ' invalid');
        postData(dataInBuffer, 'application/json', function(error, status, response) {
          if (error) {
            throw error;
          }
          assert.strictEqual(status, 400);
          done();
        });
      });

      it('return 200 when payload is empty', function(done) {
        var dataInBuffer = new Buffer(0);
        postData(dataInBuffer, 'application/json', function(error, status, response) {
          if (error) {
            throw error;
          }
          assert.strictEqual(status, 200);
          assert.strictEqual(response, JSON.stringify(dataInBuffer));
          done();
        });
      });

    });


  }); // end of 'should parse body according to API consumes' test block

  describe('should provide consistent GET response', function() {
    it('without content-type header', function(done) {
      request
        .get('/v1/context?name=request.body')
        .expect(200, { name: 'request.body', value: (new Buffer(0)).toJSON() }, done);
    });

    it('with content-type header', function(done) {
      request
        .get('/v1/context?name=request.body')
        .set('content-type', 'application/json')
        .expect(200, { name: 'request.body', value: (new Buffer(0)).toJSON() }, done);
    });

  }); // end of 'should provide consistent GET response w/ or w/o content-type header' test block

  it('should provide vendor extensions', function(done) {
    request
      .get('/v1/context?name=api.document.x-kaiser-payment-methods.methods')
      .expect(200, {
        name: 'api.document.x-kaiser-payment-methods.methods',
        value: [
          'creditcard',
          'paypal' ] }, done);
  });


});
