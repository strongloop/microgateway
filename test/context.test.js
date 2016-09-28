// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var assert = require('assert');
var debug = require('debug')('context-test');
var loopback = require('loopback');
var request = require('supertest');
var urlParser = require('url');
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;

var context = require('../lib/context');

var API_PATH_HEADER = 'X-API-PATH';

describe('Context middleware', function() {

  resetLimiterCache();
  describe('Request category variables', function() {
    var app = loopback();
    app.use(context());
    app.use(function(req, resp) {
      var ctx = req.ctx;

      ctx.set('api.document.basePath', '');
      ctx.set('_.api.path', req.get(API_PATH_HEADER));

      var result = {
        verb: ctx.get('request.verb'),
        uri: ctx.get('request.uri'),
        path: ctx.get('request.path'),
        search: ctx.get('request.search'),
        querystring: ctx.get('request.querystring'),
        headers: ctx.get('request.headers'),
        'content-type': ctx.get('request.content-type'),
        authorization: ctx.get('request.authorization') };

      // the '.' notation should also work the same as getter
      assert.strictEqual(ctx.request.verb, ctx.get('request.verb'));
      assert.strictEqual(ctx.request.uri, ctx.get('request.uri'));
      assert.strictEqual(ctx.request.path, ctx.get('request.path'));
      assert.strictEqual(ctx.request.search, ctx.get('request.search'));
      assert.strictEqual(ctx.request.querystring, ctx.get('request.querystring'));
      assert(_.isEqual(ctx.request.headers, ctx.get('request.headers')));
      assert.strictEqual(ctx.request['content-type'],
                         ctx.get('request.content-type'));
      assert.strictEqual(ctx.request.authorization,
                         ctx.get('request.authorization'));

      resp.send(result);

    });

    function verifyResponse(res, expected) {
      var variables = [ 'verb', 'path', 'search', 'querystring',
          'content-type', 'authorization' ];
      variables.forEach(function(value) {
        assert.strictEqual(res.body[value], expected[value],
                           'request.' + value);
      });

      // verify the uri
      var url = urlParser.parse(res.body.uri);
      assert.ok(url.protocol, 'should have protocol');
      assert.ok(url.hostname, 'should have hostname');
      assert.strictEqual(url.search ? url.pathname + url.search : url.pathname,
                         expected.uri);

      // remove the headers not in testing scope
      var headers = res.body.headers;
      var removeHeader = [ 'accept-encoding',
                           'connection',
                           'content-length',
                           'content-type',
                           'host',
                           'user-agent',
                           API_PATH_HEADER.toLowerCase() ];
      removeHeader.forEach(function(value) {
        delete headers[value];
      });

      assert(_.isEqual(headers, expected.headers));
    }

    it('should support "HTTP GET /"', function(done) {
      var expect = {
        verb: 'GET',
        uri: '/',
        path: '/',
        search: '',
        querystring: '',
        'content-type': undefined,
        authorization: undefined,
        headers: {} };
      request(app)
        .get('/')
        .set(API_PATH_HEADER, '/')
        .expect(function(res) {
          verifyResponse(res, expect);
        })
        .end(done);
    });

    it('should support "HTTP GET /x/y/z"', function(done) {
      var expect = {
        verb: 'GET',
        uri: '/x/y/z',
        path: '/x/y/z',
        search: '',
        querystring: '',
        'content-type': undefined,
        authorization: undefined,
        headers: {} };
      request(app)
        .get('/x/y/z')
        .set(API_PATH_HEADER, '/x/y/z')
        .expect(function(res) {
          verifyResponse(res, expect);
        })
        .end(done);
    });

    it('should support "HTTP GET /foo/bar?param1=1&param2=2"', function(done) {
      var expect = {
        verb: 'GET',
        uri: '/foo/bar?param1=1&param2=2',
        path: '/foo/bar',
        search: '?param1=1&param2=2',
        querystring: 'param1=1&param2=2',
        'content-type': undefined,
        authorization: undefined,
        headers: {} };
      request(app)
        .get('/foo/bar?param1=1&param2=2')
        .set(API_PATH_HEADER, '/foo/bar')
        .expect(function(res) {
          verifyResponse(res, expect);
        })
        .end(done);
    });

    it('should support "HTTP GET with headers"', function(done) {
      var expect = {
        verb: 'GET',
        uri: '/foo/bar?param1=1&param2=2',
        path: '/foo/bar',
        search: '?param1=1&param2=2',
        querystring: 'param1=1&param2=2',
        'content-type': undefined,
        authorization: undefined,
        headers: {
          'x-api-gateway': 'foo' } };
      request(app)
        .get('/foo/bar?param1=1&param2=2')
        .set(expect.headers)
        .set(API_PATH_HEADER, '/foo/bar')
        .expect(function(res) {
          verifyResponse(res, expect);
        })
        .end(done);
    });

    it('should support "HTTP POST /foo?x=1"', function(done) {
      var expect = {
        verb: 'POST',
        uri: '/foo?x=1',
        path: '/foo',
        search: '?x=1',
        querystring: 'x=1',
        'content-type': 'application/json',
        authorization: undefined,
        headers: {} };
      request(app)
        .post('/foo?x=1')
        .set(API_PATH_HEADER, '/foo')
        .send({ message: 'Hello World' })
        .expect(function(res) {
          verifyResponse(res, expect);
        })
        .end(done);
    });

    describe('should produce request.date variable', function() {
      it('value should be between client sends/receives request',
         function(done) {
           var myapp = loopback();
           myapp.use(context());
           myapp.use(function(req, resp) {
             resp.send({ 'request.date': req.ctx.get('request.date').getTime() });
           });

           var timeBeforeInvoke = Date.now();
           request(myapp)
             .get('/')
             .expect(function(res) {
               var timeAfterInvoke = Date.now();
               assert(_.inRange(res.body['request.date'],
                                timeBeforeInvoke, timeAfterInvoke + 1));
             })
             .end(done);
         });
    });

    describe('should normalize HTTP content-type', function() {
      var removeContentTypeURL = '/remove-content-type';
      var myapp = loopback();
      myapp.use(function(req, resp, next) {
        if (req.originalUrl === removeContentTypeURL) {
          req.headers['content-type'] = undefined;
        }
        next();
      });
      myapp.use(context());
      myapp.use(function(req, resp) {
        var ctx = req.ctx;
        resp.send(ctx.get('request.content-type'));
      });

      var origTypes = [
        'application/json',
        'application/vcard+json',
        'text/javascript',
        'application/javascript',
        'application/xml',
        'application/soap+xml',
        'text/xml' ];
      var normalizedTypes = [
        'application/json',
        'application/json',
        'application/json',
        'application/json',
        'application/xml',
        'application/xml',
        'application/xml' ];
      var payload = [
        { hello: 'world' },
        JSON.stringify({ hello: 'world' }),
        '"use strict;"',
        '"use strict;"',
        '<?xml version="1.0"?><hello/>',
        '<?xml version="1.0"?><hello/>',
        '<?xml version="1.0"?><hello/>' ];

      origTypes.forEach(function(type, index) {
        it('should normalize ' + type + ' to ' + normalizedTypes[index],
           function(done) {
             request(myapp)
               .post('/foo')
               .set('content-type', type)
               .send(payload[index])
               .expect(200, normalizedTypes[index], done);
           });
      });

      it('should not normalize application/octet-stream', function(done) {
        var type = 'application/octet-stream';
        request(myapp)
          .post('/foo')
          .set('content-type', type)
          .send(new Buffer([ 0x01, 0x02 ]))
          .expect(200, type, done);
      });

      it('should not normalized undefined/empty content type', function(done) {
        request(myapp)
          .post(removeContentTypeURL)
          .set('content-type', '')
          .send(new Buffer([ 0x01, 0x02 ]))
          .expect(200, '', done); // when res.send(undefined), '' is received
      });

    }); // end of 'should normalize HTTP content-type' test

    describe('should produce req.path according to api.basepath', function() {
      var apiBasePath;
      var expectedRequestPath;
      var myapp = loopback();
      myapp.use(context());
      myapp.use(function(req, resp) {
        var ctx = req.ctx;

        // set the API basepath
        ctx.set('api.document.basePath', apiBasePath);
        ctx.set('_.api.path', req.get(API_PATH_HEADER));
        try {
          assert.strictEqual(ctx.get('request.path'), expectedRequestPath);
          resp.send('done');
        } catch (error) {
          resp.status(500).send(error);
        }
      });

      /**
       * @parameter basepath: the API basepath
       * @parameter requstPath: the URI to send
       * @parameter expect: the expected $(request.path) value
       * @parameter done: the mocha test callback
       */
      function sendRequest(basepath, apiPath, requestPath, expect, done) {
        apiBasePath = basepath;
        expectedRequestPath = expect;
        request(myapp)
          .get(requestPath)
          .set(API_PATH_HEADER, apiPath)
          .expect(200, 'done', done);
      }

      var testData = [
        // basePath is undefined in the swagger
        { base: undefined, apiPath: '/a/b', request: '/a/b', expect: '/a/b' },

        // basePath is '' in the swagger
        { base: '', apiPath: '/foo', request: '/foo', expect: '/foo' },
        { base: '', apiPath: '/foo/bar', request: '/foo/bar', expect: '/foo/bar' },

        // basePath is '/' in the swagger
        { base: '/', apiPath: '/foo', request: '/foo', expect: '/foo' },
        { base: '/', apiPath: '/foo/bar', request: '/foo/bar', expect: '/foo/bar' },
        { base: '/', apiPath: '/foo/bar', request: '/foo/bar?name=hello', expect: '/foo/bar' },

        // basePath is '/foo' in the swagger (one level)
        { base: '/foo', apiPath: '/', request: '/foo', expect: '/foo' },
        { base: '/foo', apiPath: '/', request: '/foo/', expect: '/foo/' },
        { base: '/foo', apiPath: '/bar', request: '/foo/bar', expect: '/foo/bar' },
        { base: '/foo', apiPath: '/bar/', request: '/foo/bar/', expect: '/foo/bar/' },
        { base: '/foo', apiPath: '/bar', request: '/foo/bar?=hello', expect: '/foo/bar' },

        // basePath is '/v1/test' in the swagger (two levels)
        { base: '/v1/test', apiPath: '/foo', request: '/v1/test/foo', expect: '/v1/test/foo' },

        // basePath does not start with '/' is invalid

        // basePath ends with '/'
        { base: '/v1/test/', apiPath: '/foo', request: '/v1/test/foo', expect: '/v1/test/foo' } ];

      testData.forEach(function(data) {
        it('$(request.path) should be "' + data.expect +
           '" when basepath=' + data.base +
           ' and request URI=' + data.request, function(done) {
          sendRequest(data.base, data.apiPath, data.request, data.expect, done);
        });
      });

      it('should work when api.basepath mismatch originalUrl', function(done) {
        apiBasePath = 'foot';
        request(myapp)
          .get('/foo/bar')
          .set(API_PATH_HEADER, '/bar')
          .expect(500, done);
      });
    });

    describe('should parse HTTP authorization header', function() {
      var myapp = loopback();
      myapp.use(context());
      myapp.use(function(req, resp) {
        var ctx = req.ctx;
        if (ctx.get('request.authorization')) {
          resp.json(ctx.get('request.authorization'));
        } else {
          resp.send('');
        }
      });

      it('should parse basic auth header', function(done) {
        var username = 'username';
        var password = 'password';
        var encoded = (new Buffer(username + ':' + password))
            .toString('base64');

        request(myapp)
          .get('/')
          .auth(username, password)
          .expect(200, {
            scheme: 'Basic',
            params: [],
            token: encoded }, done);
      });

      it('should return undefined when no auth header', function(done) {
        request(myapp)
          .get('/')
          .expect(200, '', done);
      });
    }); // end of should parse HTTP authorization header test

    describe('should reject/ignore non-empty payload when needed', function() {
      var app = loopback();
      app.use(function(req, resp, next) {
        // Because unable to find a node module that can send payload with
        // GET, HEAD, and DELETE methods, use this middleware to override
        // the HTTP method name
        req.method = req.get('X-METHOD-NAME') || req.method;
        next();
      });
      app.use(context());
      app.use(function(req, resp) {
        debug('get context content');
        var ctx = req.ctx;
        resp.send({
          type: typeof ctx.get('request.body'),
          body: ctx.get('request.body').toString() });
      });
      app.use(function(error, req, resp, next) {
        debug('receive error: ', error);
        resp.status(500).json(error);
      });

      it('should ignore OPTIONS method w/ payload', function(done) {
        request(app)
          .options('/foo')
          .type('text')
          .send('hello world')
          .expect(200, { type: 'object', body: '' }, done);
      });

      [ 'GET', 'HEAD', 'DELETE' ].forEach(function(method) {
        //microgateway issue #4: should not reject a GET request with payload
        it.skip('should reject ' + method + ' method w/ payload', function(done) {
          request(app)
            .post('/foo')
            .set('X-METHOD-NAME', method)
            .type('text')
            .send('hello world')
            .expect(function(res) {
              assert.strictEqual(res.status, 500);
              // verify the error is rewritten
              delete res.body.name;
              delete res.body.message;
              assert(_.isEmpty(res.body));
            })
            .end(done);
        });
      });
    }); // end of 'should reject/ignore non-empty payload when needed' test

  }); // end of 'Request category variables test

  describe('Message category variables', function() {
    describe('should contain headers properties', function() {
      var app = loopback();
      app.use(context());
      app.use(function(req, resp) {
        var ctx = req.ctx;

        // message.headers should be equal to request.headers
        function normalizeMessageHeaders() {
          var lowerCaseMessageHeaders = {};
          Object.getOwnPropertyNames(ctx.get('message.headers')).forEach(function(name) {
            lowerCaseMessageHeaders[name.toLowerCase()] = ctx.get('message.headers')[name];
          });
          return lowerCaseMessageHeaders;
        }

        assert(_.isEqual(normalizeMessageHeaders(),
                         ctx.get('request.headers')));

        // set additional headers. Header should be writable
        var headers = ctx.get('message.headers');
        headers['foo'] = 'bar';

        assert.strictEqual(ctx.get('message.headers').foo, 'bar');

        // modify message.headers should not change request.header
        assert(!_.isEqual(normalizeMessageHeaders(),
                          ctx.get('request.headers')));

        resp.send('done');

      });

      it('should work with HTTP GET method', function(done) {
        request(app)
          .get('/foo')
          .set('X-GATEWAY-FOO', 'bar')
          .set('DATE', new Date())
          .expect(200, 'done', done);
      });

      it('should work with HTTP POST method w/ JSON data', function(done) {
        var payload = { foo: 'bar' };
        request(app)
          .post('/foo')
          .set('content-type', 'application/json')
          .send(payload)
          .expect(200, 'done', done);
      });

      it('should work with HTTP POST method w/ TEXT data', function(done) {
        var payload = 'plain text';
        request(app)
          .post('/foo')
          .set('content-type', 'text/plain')
          .send(payload)
          .expect(200, 'done', done);
      });

      it('should work with HTTP POST method w/ TEXT data and JSON content-type',
         function(done) {
           var payload = 'plain text';
           request(app)
             .post('/foo')
             .set('content-type', 'application/json')
             .send(payload)
             .expect(200, 'done', done);
         });

      it('should work with HTTP POST method w/ BINARY data', function(done) {
        var payload = 'raw data';
        request(app)
          .post('/foo')
          .set('content-type', 'binary/octet-stream')
          .send(payload)
          .expect(200, 'done', done);
      });
    }); // end of 'should contain headers and body properties' test

  }); // end of Message category variables test

  describe('Read-only variables', function() {
    var app = loopback();
    app.use(context());
    app.use(function(req, resp) {
      var roVars = [ 'request.verb',
                     'request.uri',
                     'request.path',
                     'request.headers',
                     'request.content-type',
                     'request.date',
                     'request.authorization',
                     // 'request.body', request.body is writable till preflow phase set it to read-only
                     'system.datetime',
                     'system.time.hour',
                     'system.time.minute',
                     'system.time.seconds',
                     'system.date.day-of-week',
                     'system.date.day-of-month',
                     'system.date.month',
                     'system.date.year',
                     'system.timezone',
                     'system' ];
      var ctx = req.ctx;

      roVars.forEach(function(varName) {
        assert.throws(function() {
          ctx.set(varName, 'new value');
        }, 'Expect exception when ctx.set("' + varName + '")');

        assert.throws(function() {
          var name = varName.split('.');
          assert.equal(name.length, 2);
          ctx.apim[name[0]][name[1]] = 'new value';
        }, 'Expect exception when setting ctx.' + varName);
      });

      assert.throws(function() {
        ctx.headers.newHeader = 'newVarlue';
      });
      resp.send('done');
    });

    it('should not allow update request variables', function(done) {
      request(app)
        .post('/foo')
        .set('X-GATEWAY-FOO', 'bar')
        .set('DATE', new Date())
        .send({ message: 'Hello World' })
        .expect(200, 'done', done);
    });
  }); // end of Read-only variables test

  describe('System category variables', function() {
    var timeBeforeInvoke;
    var app = loopback();
    app.use(function(req, resp, next) {
      // trim the milliseconds, as the system.datetime procision is only
      // in seconds.
      timeBeforeInvoke = _.floor(Date.now(), -3);
      debug('time before context middleware - ', timeBeforeInvoke);
      next();
    });
    app.use(context());
    app.use(function(req, resp) {
      var ctxDateTime = Date.parse(req.ctx.get('system.datetime'));
      debug('get context datetime - ', ctxDateTime);

      // 1. Verify system.datetime property
      var timeAfterInvoke = Date.now();
      debug('record the time after context middleware - ', timeAfterInvoke);
      assert(_.inRange(ctxDateTime, timeBeforeInvoke, timeAfterInvoke + 1));

      // 2. Verify system.date and system.time property
      function toDateObject(date, time) {
        return new Date(date.year, date.month, date['day-of-month'],
                        time.hour, time.minute, time.seconds);
      }

      // the returned date/time is in UTC
      ctxDateTime = toDateObject(req.ctx.get('system.date'),
                                 req.ctx.get('system.time'));
      ctxDateTime = ctxDateTime.getTime();
      timeAfterInvoke = Date.now();
      assert(_.inRange(ctxDateTime, timeBeforeInvoke, timeAfterInvoke + 1));

      // 3. Verify timezone property
      var ctxTimezoneStr = req.ctx.get('system.timezone');
      var ctxTimezoneOffset = 0;
      var isBehindGMT = (ctxTimezoneStr[0] === '-');
      ctxTimezoneStr = ctxTimezoneStr.substring(1);
      ctxTimezoneStr.split(':').forEach(function(value, index) {
        if (index === 0) {
          ctxTimezoneOffset += 60 * parseInt(value, 10);
        } else {
          ctxTimezoneOffset += parseInt(value, 10);
        }
      });
      ctxTimezoneOffset = isBehindGMT ? ctxTimezoneOffset : -ctxTimezoneOffset;
      assert.equal((new Date()).getTimezoneOffset(), ctxTimezoneOffset);

      // 4. Verify system.time should contain hour, minute, and seconds
      var expectedProperties = [ 'hour', 'minute', 'seconds' ];
      expectedProperties.every(function(prop) {
        req.ctx.get('system.time').hasOwnProperty(prop);
      });

      // 5. system.date should contain day-of-week, day-of-month, month, and year
      expectedProperties = [ 'year', 'month', 'day-of-month', 'day-of-week' ];
      expectedProperties.every(function(prop) {
        req.ctx.get('system.date').hasOwnProperty(prop);
      });

      resp.send('done');
    });

    it('should produce correct date time values', function(done) {
      request(app)
        .post('/foo')
        .send('hello')
        .expect(200, 'done', done);
    });
  }); // end of System category variables test

  describe('Create context middleware with options', function() {
    it('should be able to override contentTypeMaps', function(done) {
      var contextOptions = {
        request: {
          contentTypeMaps: [
            { 'application/json': [ 'json', '+json' ] } ] } };

      var app = loopback();
      app.use(context(contextOptions));
      app.use(function(req, resp) {
        var ctx = req.ctx;

        var result = {};
        result['content-type'] = ctx.get('request.content-type');
        result['payload'] = ctx.get('request.body').toString();

        resp.send(result);
      });

      var payload = 'console.log("hello world");';
      var contentType = 'text/javascript';
      request(app)
        .post('/foo')
        .set('content-type', contentType)
        .send(payload)
        .expect(200, {
          'content-type': contentType,
          payload: payload }, done);
    });

    it('should be able to override date and time format', function(done) {
      var contextOptions = {
        system: {
          datetimeFormat: 'YYYY-MM-DD@HH:mm:ssZ',
          timezoneFormat: 'ZZ' } };

      var app = loopback();
      app.use(context(contextOptions));
      app.use(function(req, resp) {
        var ctx = req.ctx;

        try {
          assert(ctx.get('system.datetime').indexOf('@') === 10);
          assert(ctx.get('system.timezone').indexOf(':') === -1);
          resp.send('done');
        } catch (error) {
          resp.send(error);
        }
      });

      request(app)
        .get('/foo')
        .expect(200, 'done', done);
    });

    describe('should be able to override request.body filtering', function() {
      var contextOptions = { request: { bodyFilter: {} } };
      var payload = 'hello world';

      var app = loopback();
      app.use(function(req, resp, next) {
        // Because unable to find a node module that can send payload with
        // GET, HEAD, and DELETE methods, use this middleware to override
        // the HTTP method name
        req.method = req.get('X-METHOD-NAME') || req.method;
        next();
      });
      app.use(context(contextOptions));
      app.use(function(req, resp) {
        debug('get context content');
        var ctx = req.ctx;
        try {
          assert.strictEqual(ctx.get('request.body').toString(), payload);
          resp.status(200).send('done');
        } catch (error) {
          resp.status(500).send(error);
        }
      });

      it('should accept OPTIONS method payload', function(done) {
        request(app)
          .options('/foo')
          .type('text')
          .send(payload)
          .expect(200, done);
      });

      [ 'GET', 'HEAD', 'DELETE' ].forEach(function(method) {
        it('should accept ' + method + ' method payload', function(done) {
          request(app)
            .post('/foo')
            .set('X-METHOD-NAME', method)
            .type('text')
            .send(payload)
            .expect(200, done);
        });
      });
    });

  }); // end of Create context middleware with options test
});
