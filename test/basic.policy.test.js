'use strict';

var express = require('express');
var request = require('supertest')('http://localhost:3000');

var echoServer = express();
echoServer.get('/*', function(req, resp) {
  resp.send(req.url);
});
echoServer.post('/*', function(req, resp) {
  req.pipe(resp);
});

function startEchoServer(done) {
  echoServer.listen(8889, done);
}

function startMicroGateway(done) {
  var microgw = require('../lib/microgw');
  microgw.start(3000, done);
}

function startLdapServer(done) {
  var ldapserver = require('./support/ldap-server/ldap-server');
  ldapserver.start().then(done, done);
}

describe('basic auth policy', function() {
  before(startEchoServer);
  before(startMicroGateway);
  before(startLdapServer);

  it('test case 1', function(done) {
    request
      .get('/apim/sb/v1/ascents')
      .expect(200, '/api1', done);
  });
});
