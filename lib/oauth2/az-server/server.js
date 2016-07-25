// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var UnorderedList = require('./unorderedlist');
var _ = require('lodash');
var merge = _.extend;
var authentication = require('./middleware/authentication');
var authorization = require('./middleware/authorization');
var decision = require('./middleware/decision');
var revoke = require('./middleware/revoke');
var token = require('./middleware/token');
var errorHandler = require('./middleware/errorHandler');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth2:az-server:server' });


/**
 * `Server` constructor.
 *
 * @api public
 */
function Server() {
  this._reqParsers = [];
  this._resHandlers = [];
  this._exchanges = [];

  this._serializers = [];
  this._deserializers = [];
  this._scopes = [];
  this._responseTypes = [];
  this._grantTypes = [];
}

/**
 * Register authorization grant middleware.
 *
 * OAuth 2.0 defines an authorization framework, in which authorization grants
 * can be of a variety of types.  Initiating and responding to an OAuth 2.0
 * authorization transaction is implemented by grant middleware, and the server
 * registers the middleware it wishes to support.
 *
 * Examples:
 *
 *     server.grant(oauth2orize.grant.code());
 *
 *     server.grant('*', function(req) {
 *       return { host: req.headers['host'] }
 *     });
 *
 *     server.grant('foo', function(req) {
 *       return { foo: req.query['foo'] }
 *     });
 *
 * @param {String|Object} type
 * @param {String} phase
 * @param {Function} fn
 * @return {Server} for chaining
 * @api public
 */
Server.prototype.grant = function(type, phase, fn) {
  var mod;
  if (typeof type === 'object') {
    // sig: grant(mod)
    mod = type;
    if (mod.request) {
      this.grant(mod.name, 'request', mod.request);
    }
    if (mod.response) {
      this.grant(mod.name, 'response', mod.response);
    }
    if (mod.responseType) {
      this.responseType(mod.responseType);
    };
    return this;
  }

  if (typeof phase === 'object') {
    // sig: grant(type, mod)
    mod = phase;
    if (mod.request) {
      this.grant(type, 'request', mod.request);
    }
    if (mod.response) {
      this.grant(type, 'response', mod.response);
    }
    return this;
  }

  if (typeof phase === 'function') {
    // sig: grant(type, fn)
    fn = phase;
    phase = 'request';
  }

  if (type === '*') {
    type = null;
  }

  if (type) {
    type = new UnorderedList(type);
  }

  if (phase === 'request') {
    logger.debug('register request parser %s %s',
            type || '*', fn.name || 'anonymous');
    this._reqParsers.push({ type: type, handle: fn });
  } else if (phase === 'response') {
    logger.debug('register response handler %s %s',
            type || '*', fn.name || 'anonymous');
    this._resHandlers.push({ type: type, handle: fn });
  }

  return this;
};

/**
 * Register token exchange middleware.
 *
 * OAuth 2.0 defines an authorization framework, in which authorization grants
 * can be of a variety of types.  Exchanging of these types for access tokens is
 * implemented by exchange middleware, and the server registers the middleware
 * it wishes to support.
 *
 * Examples:
 *
 *     server.exchange(oauth2orize.exchange.authorizationCode(function() {
 *       ...
 *     }));
 *
 * @param {String|Function} type
 * @param {Function} fn
 * @return {Server} for chaining
 * @api public
 */
Server.prototype.exchange = function(type, fn) {
  if (typeof type === 'function') {
    fn = type;
    type = fn.name;
  }

  if (type === '*') {
    type = null;
  }

  logger.debug('register exchanger %s %s', type || '*', fn.name || 'anonymous');
  this._exchanges.push({ type: type, handle: fn });

  return this;
};

/**
 * Authenticate the resource owner of a token request for MicroGateway.
 *
 * @api public
 */
Server.prototype.userAuthentication =
function(snapid, authCfg, username, password, done) {
  return authentication.userAuthenticate(
          snapid, authCfg, username, password, done);
};

/**
 * Middleware: authenticate the client of a token request for MicroGateway.
 *
 * @api public
 */
Server.prototype.authentication = function(clientType, authCfg, models) {
  return authentication.clientAuthenticate(clientType, authCfg, models);
};

/**
 * Parses requests to obtain authorization.
 *
 * @api public
 */
Server.prototype.authorize =
Server.prototype.authorization = function(options, validate) {
  return authorization(this, options, validate);
};

/**
 * Handle a user's response to an authorization dialog.
 *
 * @api public
 */
Server.prototype.decision = function(options, parse) {
  return decision(this, options, parse);
};

/**
 * Handle requests to exchange an authorization grant for an access token.
 *
 * @api public
 */
Server.prototype.token = function(options) {
  return token(this, options);
};

/**
 * Handles token revocation
 * @param options
 * @param {Function} revokeToken A function to revoke token
 * @returns {Function|*}
 */
Server.prototype.revoke = function(options, revokeToken) {
  return revoke(this, options);
};

/**
 * Add the server supported scope
 * @param scope string with ' ' space separator or a string array
 */
Server.prototype.scope = function(scopes) {
  if (_.isString(scopes)) {
    scopes = scopes.split(' ');
  }

  for (var index = 0, len = scopes.length; index < len; index++) {
    var one = scopes[index];
    if (this._scopes.indexOf(one) === -1) {
      this._scopes.push(one);
    }
  }
};

/**
 * verify if server supports the specific scope
 * @param scopes
 * @returns
 */
Server.prototype.supportScope = function(scopes) {
  if (_.isString(scopes)) {
    scopes = scopes.split(' ');
  }

  logger.debug('check:', scopes, 'supported:', this._scopes);
  for (var index = 0, len = scopes.length; index < len; index++) {
    var one = scopes[index];
    if (this._scopes.indexOf(one) === -1) {
      return false;
    }
  }
  return true;
};

Server.prototype.grantType = function(grantTypes) {
  if (_.isString(grantTypes)) {
    grantTypes = grantTypes.split(' ');
  }

  for (var index = 0, len = grantTypes.length; index < len; index++) {
    var one = grantTypes[index];
    if (this._grantTypes.indexOf(one) === -1) {
      this._grantTypes.push(one);
    }
  }
};

Server.prototype.supportGrantType = function(grantTypes) {
  if (_.isString(grantTypes)) {
    grantTypes = grantTypes.split(' ');
  }

  logger.debug('check: ', grantTypes, ', supported: ', this._grantTypes);
  for (var index = 0, len = grantTypes.length; index < len; index++) {
    var one = grantTypes[index];
    if (this._grantTypes.indexOf(one) === -1) {
      return false;
    }
  }
  return true;
};

/**
 * add a supported responseType
 * @param responseType a string with ' ' space separator or a string
 *        array
 */
Server.prototype.responseType = function(responseTypes) {
  if (_.isString(responseTypes)) {
    responseTypes = responseTypes.split(' ');
  }

  for (var index = 0, len = responseTypes.length; index < len; index++) {
    var one = responseTypes[index];
    if (this._responseTypes.indexOf(one) === -1) {
      this._responseTypes.push(one);
    }
  }
};

Server.prototype.supportResponseType = function(responseTypes) {
  if (_.isString(responseTypes)) {
    responseTypes = responseTypes.split(' ');
  }

  logger.debug('check:', responseTypes, 'supported:', this._responseTypes);
  for (var index = 0, len = this.responseType.length; index < len; index++) {
    var one = responseTypes[index];
    if (this._responseTypes.indexOf(one) === -1) {
      return false;
    }
  }
  return true;
};
/**
 * Respond to errors encountered in OAuth 2.0 endpoints.
 *
 * @api public
 */
Server.prototype.errorHandler = function(options) {
  return errorHandler(options);
};

/**
 * Registers a function used to serialize client objects into the session.
 *
 * Examples:
 *
 *     server.serializeClient(function(client, done) {
 *       done(null, client.id);
 *     });
 *
 * @api public
 */
Server.prototype.serializeClient = function(fn, done) {
  if (typeof fn === 'function') {
    return this._serializers.push(fn);
  }

  // private implementation that traverses the chain of serializers, attempting
  // to serialize a client
  var client = fn;

  var stack = this._serializers;
  (function pass(i, err, obj) {
    // serializers use 'pass' as an error to skip processing
    if (err === 'pass') {
      err = undefined;
    }
    // an error or serialized object was obtained, done
    if (err || obj) {
      return done(err, obj);
    }

    var layer = stack[i];
    if (!layer) {
      return done(new Error('Failed to serialize client. ' +
                  'Register serialization function using serializeClient().'));
    }

    try {
      layer(client, function(e, o) { pass(i + 1, e, o); });
    } catch (ex) {
      return done(ex);
    }
  })(0);
};

/**
 * Registers a function used to deserialize client objects out of the session.
 *
 * Examples:
 *
 *     server.deserializeClient(function(id, done) {
 *       Client.findById(id, function (err, client) {
 *         done(err, client);
 *       });
 *     });
 *
 * @api public
 */
Server.prototype.deserializeClient = function(fn, done) {
  if (typeof fn === 'function') {
    return this._deserializers.push(fn);
  }

  // private implementation that traverses the chain of deserializers,
  // attempting to deserialize a client
  var obj = fn;

  var stack = this._deserializers;
  (function pass(i, err, client) {
    // deserializers use 'pass' as an error to skip processing
    if (err === 'pass') {
      err = undefined;
    }
    // an error or deserialized client was obtained, done
    if (err || client) {
      return done(err, client);
    }
    // a valid client existed when establishing the session, but that client has
    // since been deauthorized
    if (client === null || client === false) {
      return done(null, false);
    }

    var layer = stack[i];
    if (!layer) {
      return done(new Error('Failed to deserialize client. ' +
                  'Register deserialization function using deserializeClient().'));
    }

    try {
      layer(obj, function(e, c) { pass(i + 1, e, c); });
    } catch (ex) {
      return done(ex);
    }
  })(0);
};


/**
 * Parse authorization request into transaction using registered grant middleware.
 *
 * @param {String} type
 * @param {http.ServerRequest} req
 * @param {Function} cb
 * @api private
 */
Server.prototype._parse = function(type, req, cb) {
  var ultype = new UnorderedList(type);
  var stack = this._reqParsers;
  var areq = {};

  if (type) {
    areq.type = type;
  }

  (function pass(i) {
    var layer = stack[i];
    if (!layer) {
      return cb(null, areq);
    }

    try {
      logger.debug('parse:%s', layer.handle.name || 'anonymous');
      if (layer.type === null || layer.type.equalTo(ultype)) {
        var arity = layer.handle.length;
        if (arity === 1) { // sync
          var o = layer.handle(req);
          merge(areq, o);
          pass(i + 1);
        } else { // async
          layer.handle(req, function(err, o) {
            if (err) { return cb(err); }
            merge(areq, o);
            pass(i + 1);
          });
        }
      } else {
        pass(i + 1);
      }
    } catch (ex) {
      return cb(ex);
    }
  })(0);
};

/**
 * Respond to authorization transaction using registered grant middleware.
 *
 * @param {Object} txn
 * @param {http.ServerResponse} res
 * @param {Function} cb
 * @api private
 */
Server.prototype._respond = function(txn, ctx, cb) {
  var ultype = new UnorderedList(txn.req.type);
  var stack = this._resHandlers;
  var idx = 0;

  function next(err) {
    if (err) {
      return cb(err);
    }

    var layer = stack[idx++];
    if (!layer) {
      return cb();
    }

    try {
      logger.debug('respond:%s', layer.handle.name || 'anonymous');
      if (layer.type === null || layer.type.equalTo(ultype)) {
        layer.handle(txn, ctx, next);
      } else {
        next();
      }
    } catch (ex) {
      return cb(ex);
    }
  }
  next();
};

/**
 * Process token request using registered exchange middleware.
 *
 * @param {String} type
 * @param {http.ServerRequest} req
 * @param {http.ServerResponse} res
 * @param {Function} cb
 * @api private
 */
Server.prototype._exchange = function(type, req, cb) {
  var stack = this._exchanges;
  var idx = 0;

  function next(err) {
    if (err) {
      return cb(err);
    }

    var layer = stack[idx++];
    if (!layer) {
      return cb();
    }

    try {
      logger.debug('exchange: %s', layer.handle.name || 'anonymous');
      if (layer.type === null || layer.type === type) {
        layer.handle(req, next);
      } else {
        next();
      }
    } catch (ex) {
      return cb(ex);
    }
  }

  next();
};

/**
 * Expose `Server`.
 */
exports = module.exports = Server;
