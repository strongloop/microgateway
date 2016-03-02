'use strict';

let mg = require('../lib/microgw');
let supertest = require('supertest');
let os = require('os');
let copy = require('../utils/copy.js');
let path = require('path');
let date = new Date();
let randomInsert = date.getTime().toString();
let destinationDir = path.join(os.tmpdir(), randomInsert + 'operation-switch');

let request;

describe('switchPolicyTesting', function() {
  before((done) => {
    copy.copyRecursive(__dirname + '/definitions/operation-switch', destinationDir);
    process.env.CONFIG_DIR = destinationDir;
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
    copy.deleteRecursive(destinationDir);
    delete process.env.NODE_ENV;
  });

  it('switchOnVerbAndPath', switchOnVerbAndPath);
  it('switchOnOperationId1', switchOnOperationId1);
  it('switchOnOperationId2', switchOnOperationId2);
  it('switchOnOperationId3', switchOnOperationId3);
  it('switchNoCase', switchNoCase);

});

function switchOnVerbAndPath(doneCB) {
  request.post('/customer')
    .expect(200, /A new customer is created/, doneCB);
}

function switchOnOperationId1(doneCB) {
  request.post('/order')
    .expect(200, /A new order is created/, doneCB);
}

function switchOnOperationId2(doneCB) {
  request.put('/order')
    .expect(200, /The given order is updated/, doneCB);
}

function switchOnOperationId3(doneCB) {
  request.delete('/order')
    .expect(500, /Deleting orders is not allowed/, doneCB);
}

//Cannot Get /order
function switchNoCase(doneCB) {
  request.get('/order')
    .expect(500, doneCB);
}

