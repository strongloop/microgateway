// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var fs = require('fs');
var path = require('path');
var Server = require('./server');

/**
 * Create an OAuth 2.0 server.
 *
 * @return {Server}
 * @api public
 */
function createServer() {
  var server = new Server();
  return server;
}

var exports = module.exports = createServer;

/**
 * Export `.createServer()`.
 */
exports.createServer = createServer;

/**
 * Export middleware.
 */
exports.errorHandler = require('./middleware/errorHandler');

function load(type) {
  var createLoader = function(type, name) {
    return function() {
      return require('./' + type + '/' + name);
    };
  };
  fs.readdirSync(__dirname + '/' + type).forEach(function(filename) {
    if (/\.js$/.test(filename)) {
      var name = path.basename(filename, '.js');
      exports[type].__defineGetter__(name, createLoader(type, name));
    }
  });
}

/**
 * Auto-load bundled grants.
 */
exports.grant = {};
load('grant');

// alias grants
exports.grant.authorizationCode = exports.grant.code;
exports.grant.implicit = exports.grant.token;

/**
 * Auto-load bundled exchanges.
 */
exports.exchange = {};
load('exchange');

// alias exchanges
exports.exchange.code = exports.exchange.authorizationCode;

/**
 * Export errors.
 */
exports.OAuth2Error = require('../errors/oauth2error');
exports.AuthorizationError = require('../errors/authorizationerror');
exports.TokenError = require('../errors/tokenerror');

