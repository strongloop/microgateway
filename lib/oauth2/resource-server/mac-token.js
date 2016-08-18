// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: loopback-component-oauth2
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var crypto = require('crypto');
var utils = require('./utils');
var helpers = require('../oauth2-helper');
var jwt = require('jws');
var debug = require('debug')('loopback:oauth2');

var algorithms = {
  'hmac-sha-1': 'sha1',
  'hmac-sha-256': 'sha256' };

module.exports = MACTokenGenerator;

function MACTokenGenerator(algorithm) {
  this.algorithm = algorithms[algorithm] || algorithm || 'sha1';
}

MACTokenGenerator.prototype.encode = function(key, text, encoding) {
  return crypto.createHmac(this.algorithm, key)
    .update(text).digest(encoding || 'base64');
};

MACTokenGenerator.prototype.generateToken = function(options) {
  var algorithm = this.algorithm === 'sha1' ? 'hmac-sha-1' : 'hmac-sha-256';
  var key = utils.uid(32);

  var payload = {
    iss: options.client.id, // issuer - client id
    sub: options.user && options.user.id, // subject
    aud: '/oauth/token', // audience
    exp: Date.now() + options.ttl * 1000, // expiration time
    iat: Date.now(), // issued at time
    scope: options.scope, // a list of oAuth 2.0 scopes
    mac_algorithm: algorithm,
    mac_key: key };

  var secret = options.client.clientSecret || options.client.restApiKey;
  var jwtAlgorithm = options.jwtAlgorithm || 'HS256';

  // Sign the access token
  var token = helpers.generateJWT(payload, secret, jwtAlgorithm);
  var kid = crypto.createHash('sha1').update(token).digest('base64');

  return {
    id: token,
    token_type: 'mac',
    kid: kid,
    mac_algorithm: algorithm,
    mac_key: key };
};

MACTokenGenerator.prototype.validate = function(req) {
  var authorizationHeader = req.get('authorization');
  if (!authorizationHeader) {
    return null;
  }
  // Parser the header
  /*
   Authorization: MAC access_token="h480djs93hd8",
   ts="1336363200",
   kid="dj83hs9s",
   mac="bhCQXTVyfj5cmA9uKkPFx1zeOXM="
   */

  var params = {};
  var i;
  var n;
  if (authorizationHeader.indexOf('MAC ') === 0) {
    authorizationHeader = authorizationHeader.substring(4);
    var parts = authorizationHeader.split(/[,\s]+/).filter(Boolean);
    for (i = 0, n = parts.length; i < n; i++) {
      var part = parts[i];
      var index = part.indexOf('=');
      var kv = [];
      kv[0] = part.substring(0, index);
      kv[1] = part.substring(index + 1);
      var val = kv[1];
      if (val[0] === '"') {
        val = val.substring(1, val.length - 1);
      }
      params[kv[0]] = val;
    }
  } else {
    return null;
  }

  debug('MAC authorization: %s', authorizationHeader);

  var h = params.h || 'host';
  // var seqNr = params['seq-nr'];
  // var cb = params.cb;
  // var kid = params.kid;
  var ts = Number(params.ts) || 0;
  if ((Date.now() - ts) / 1000 > 300) {
    debug('Timestamp expired: %d', ts);
    return null;
  }
  var method = req.method.toUpperCase();
  var reqUri = req.originalUrl;
  var mac = params.mac;

  // Add header values
  var headers = [];
  var headerNames = h.split(/[,\s]+/).filter(Boolean);
  for (i = 0, n = headerNames.length; i < n; i++) {
    var header = req.get(headerNames[i]) || '';
    headers.push(header);
  }

  var accessToken = jwt.decode(params.access_token, { json: true });
  debug('Decoded access token: %j', accessToken);

  var text = [ method + ' ' + reqUri + ' HTTP/' + req.httpVersion, ts ]
      .concat(headers).join('\n');

  var signature = this.encode(accessToken.payload.mac_key, text);

  debug('Input string: %s, key: %s, mac: %s',
    text, accessToken.payload.mac_key, signature);

  if (mac !== signature) {
    debug('MAC signature does not match');
    return null;
  }

  return params.access_token;
};

