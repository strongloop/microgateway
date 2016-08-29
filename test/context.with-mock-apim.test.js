// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var _ = require('lodash');
var apimServer = require('./support/mock-apim-server/apim-server');
var assert = require('assert');
var debug = require('debug')('context-test');
var fs = require('fs');
var microgw = require('../lib/microgw');
var supertest = require('supertest');
var dsCleanup = require('./support/utils').dsCleanup;
var resetLimiterCache = require('../lib/rate-limit/util').resetLimiterCache;


describe('Context variables testing with mock apim server', function() {
  var request, path, apiDocuments;

  before(function() {
    process.env.CONFIG_DIR = __dirname + '/definitions/default';
    process.env.DATASTORE_PORT = 5000;
    process.env.APIMANAGER_PORT = 8081;
    process.env.APIMANAGER = '127.0.0.1';
    process.env.NODE_ENV = 'production';

    resetLimiterCache();
    request = supertest('http://localhost:3000');
    path = __dirname + '/definitions/context';
    apiDocuments = getAPIDefinitions();
  });

  after(function() {
    // delete environment variables
    delete process.env.CONFIG_DIR;
    delete process.env.DATASTORE_PORT;
    delete process.env.APIMANAGER_PORT;
    delete process.env.APIMANAGER;
    delete process.env.NODE_ENV;
  });

  describe('no organization / catalog shortname in path', function() {
    before(function(done) {
      apimServer.start('127.0.0.1', 8081, path)
        .then(function() { return microgw.start(3000); })
        .then(done)
        .catch(function(err) {
          console.error(err);
          done(err);
        });
    });

    after(function(done) {
      dsCleanup(5000)
        .then(function() { return microgw.stop(); })
        .then(function() { return apimServer.stop(); })
        .then(done)
        .catch(done);
    });

    it('Call API w/o clientId and security should produce expected context variables', function(done) {
      var apiDoc = apiDocuments[0];
      var expected = {
        api: {
          document: apiDoc.document,
          endpoint: {
            address: '*',
            hostname: 'localhost' },
          name: apiDoc.document.info.title,
          org: {
            id: apiDoc.organization.id,
            name: apiDoc.organization.name },
          properties: {},
          state: 'running',
          type: 'REST',
          version: apiDoc.document.info.version,
          operation: {
            path: '/estimates/price' } },
        client: {
          app: {
            id: '',
            name: '',
            secret: '' },
          org: {
            id: '',
            name: '' } },
        env: {
          path: apiDoc.catalog.name },
        plan: {
          id: 'uber:1.0.0:gold',
          name: 'gold',
          version: '1.0.0',
          'rate-limit': {
            'hard-limit': false,
            value: '1/sec' } },
        request: {
          path: '/v1/estimates/price',
          querystring: '',
          search: '',
          uri: 'http://localhost:3000/v1/estimates/price' },
        internal: {
          // consumes: undefined
          id: '564b7b3ae4b0869c782eddae',
          operation: 'get',
          // operationId: undefined
          path: '/estimates/price' } };

      request
        .get('/v1/estimates/price')
        .expect(function(res) {
          verifyResponse(res.body, expected);
        })
        .end(done);
    });

    it('Call API w/ clientId should produce expected context variables', function(done) {
      var apiDoc = apiDocuments[3];
      var expected = {
        api: {
          document: apiDoc.document,
          endpoint: {
            address: '*',
            hostname: 'localhost' },
          name: apiDoc.document.info.title,
          org: {
            id: apiDoc.organization.id,
            name: apiDoc.organization.name },
          operation: {
            id: 'routes.find',
            path: '/routes' },
          properties: {},
          state: 'running',
          type: 'REST',
          version: apiDoc.document.info.version },
        client: {
          app: {
            id: '612caa59-9649-491f-99b7-d9a941c4bd2e',
            name: 'Prod App',
            secret: '' },
          org: {
            id: '564b7c28e4b0869c782edfc1',
            name: 'co1' } },
        env: {
          path: apiDoc.catalog.name },
        plan: {
          id: 'apim:1.0.0:gold',
          name: 'gold',
          version: '1.0.0',
          'rate-limit': {
            'hard-limit': false,
            value: '1000/min' } },
        request: {
          path: '/v1/routes',
          querystring: 'client_id=612caa59-9649-491f-99b7-d9a941c4bd2e',
          search: '?client_id=612caa59-9649-491f-99b7-d9a941c4bd2e',
          uri: 'http://localhost:3000/v1/routes?client_id=612caa59-9649-491f-99b7-d9a941c4bd2e' },
        internal: {
          consumes: [
            'application/xml',
            'text/xml',
            'application/x-www-form-urlencoded',
            'application/json' ],
          id: '564b7b44e4b0869c782ede0a',
          operation: 'get',
          operationId: 'routes.find',
          path: '/routes' } };

      request
        .get('/v1/routes?client_id=612caa59-9649-491f-99b7-d9a941c4bd2e')
        //.set('x-ibm-client-id', '612caa59-9649-491f-99b7-d9a941c4bd2e')
        //.set('x-ibm-client-secret', 'k5YeP1pA1l+QBRq8fdtTDx7+qC/Dim7mSZyS1yRo8ww=')
        .expect(function(res) {
          verifyResponse(res.body, expected);
        })
        .end(done);
    });

  });


  describe('with organization / catalog shortname in path', function() {
    before(function(done) {
      process.env.WLPN_APP_ROUTE = 'http:///apim/sb';
      process.env.DATASTORE_PORT = 5000;
      apimServer.start('127.0.0.1', 8081, path)
        .then(function() { return microgw.start(3000); })
        .then(done)
        .catch(function(err) {
          console.error(err);
          done(err);
        });
    });

    after(function(done) {
      delete process.env.WLPN_APP_ROUTE;
      delete process.env.DATASTORE_PORT;

      dsCleanup(5000)
        .then(function() { return microgw.stop(); })
        .then(function() { return apimServer.stop(); })
        .then(done)
        .catch(done);
    });

    it('request.uri should contain org/catalog short names', function(done) {
      var apiDoc = apiDocuments[3];
      var expected = {
        api: {
          document: apiDoc.document,
          endpoint: {
            address: '*',
            hostname: 'localhost' },
          name: apiDoc.document.info.title,
          org: {
            id: apiDoc.organization.id,
            name: apiDoc.organization.name },
          operation: {
            id: 'routes.find',
            path: '/routes' },
          properties: {},
          state: 'running',
          type: 'REST',
          version: apiDoc.document.info.version },
        client: {
          app: {
            id: '612caa59-9649-491f-99b7-d9a941c4bd2e',
            name: 'Prod App',
            secret: '' },
          org: {
            id: '564b7c28e4b0869c782edfc1',
            name: 'co1' } },
        env: {
          path: apiDoc.catalog.name },
        plan: {
          id: 'apim:1.0.0:gold',
          name: 'gold',
          version: '1.0.0',
          'rate-limit': {
            'hard-limit': false,
            value: '1000/min' } },
        request: {
          path: '/v1/routes',
          querystring: 'client_id=612caa59-9649-491f-99b7-d9a941c4bd2e',
          search: '?client_id=612caa59-9649-491f-99b7-d9a941c4bd2e',
          uri: 'http://localhost:3000/apim/sb/v1/routes?client_id=612caa59-9649-491f-99b7-d9a941c4bd2e' },
        internal: {
          consumes: [
            'application/xml',
            'text/xml',
            'application/x-www-form-urlencoded',
            'application/json' ],
          id: '564b7b44e4b0869c782ede0a',
          operation: 'get',
          operationId: 'routes.find',
          path: '/routes' } };

      request
        .get('/apim/sb/v1/routes?client_id=612caa59-9649-491f-99b7-d9a941c4bd2e')
        //.set('x-ibm-client-id', '612caa59-9649-491f-99b7-d9a941c4bd2e')
        //.set('x-ibm-client-secret', 'k5YeP1pA1l+QBRq8fdtTDx7+qC/Dim7mSZyS1yRo8ww=')
        .expect(function(res) {
          verifyResponse(res.body, expected);
        })
        .end(done);
    });

  });


  function verifyResponse(actual, expected) {
    // compare and remove the variables whose value changes per environment
    debug(actual);
    assert(actual.api.endpoint.address);
    delete actual.api.endpoint.address;
    delete expected.api.endpoint.address;

    assert.deepEqual(actual, expected);

  }

  function getAPIDefinitions() {
    var result = [];

    var data = fs.readFileSync(path + '/v1/catalogs/564b48aae4b0869c782edc2b/apis', 'utf8');
    data = JSON.parse(data);
    assert(_.isArray(data));
    data.forEach(function(item) {
      delete item.document['x-ibm-configuration']['assembly'];
      result.push(item);
    });
    return result;
  }

});
