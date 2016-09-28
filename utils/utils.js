// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var env = require('./environment');
var path = require('path');
var fs = require('fs');
var Promise = require('bluebird');
var log = require('apiconnect-cli-logger/logger.js')
                  .child({ loc: 'microgateway:utils' });
var crypto = require('crypto');
var url = require('url');
var request = require('request');
var constants = require('constants');
var wlpnPassword = require('wlpn-password');

var version = require('../package.json').version;

exports.getTLSConfigSync = function() {
  var rev;
  var cfg = process.env[env.TLS_SERVER_CONFIG] ?
      //the env value should be a relative path to parent directory
      path.resolve(__dirname, '..', process.env[env.TLS_SERVER_CONFIG]) :
      path.resolve(__dirname, '..', 'config', 'defaultTLS.json');

  try {
    rev = JSON.parse(fs.readFileSync(cfg));
    var baseDir = path.dirname(cfg); //base dir, used for relative path
    var props = [ 'pfx', 'key', 'cert', 'ca', 'dhparam', 'ticketKeys', 'passphrase' ];
    for (var index = 0, length = props.length; index < length; index++) {
      var propName = props[index];
      if (rev[propName] instanceof Array) { // ca is capable of being array
        var values = rev[propName];
        var newValues = [];
        for (var valueIndex = 0, valueLength = values.length;
            valueIndex < valueLength; valueIndex++) {
          try {
            newValues.push(fs.readFileSync(path.resolve(baseDir, values[valueIndex])));
          } catch (e) {
            newValues.push(values[valueIndex]);
          }
        }
        rev[propName] = newValues;
      } else if (rev[propName]) {
        var filename = rev[propName];
        var property;
        if (filename.indexOf(':') !== -1) {
          var array = filename.split(':');
          filename = array[0];
          property = array[1];
        }
        try {
          var contents = fs.readFileSync(path.resolve(baseDir, filename));
          if (property) {
            var parsedFile = JSON.parse(contents);
            rev[propName] = parsedFile[property];
          } else {
            rev[propName] = contents;
          }
        } catch (e) {
          // do nothing
        }
      }
    }
    if (rev.passphrase) {
      rev.passphrase = wlpnPassword.decode(rev.passphrase);
    }
  } catch (e) {
    log.error(e);
  }

  return rev || {};
};


/**
 * sign msg with the given key and alg
 */
function signMsg(msg, key, alg) {
  var signer = crypto.createSign(alg);
  signer.update(msg);
  return signer.sign(key);
}

/**
 * hash the msg with the msg and alg
 */
function hashMsg(msg, alg) {
  var hash = crypto.createHash(alg);
  hash.update(msg);
  return hash.digest();
}

/**
 * This function decrypts and parses an encrypted response body sent by APIM
 * The body must be in the following format:
 *
 * {
 *   "key": "base64(encrypted_with_public_key(aes_256_symmetric_key))"
 *   "cipher": "base64(encrypted_with_aes_256_key(json_payload_as_string))"
 * }
 * @param body
 * @param private_key
 *
 */
function decryptAPIMResponse(body, private_key) {

  if (!body.key || !body.cipher) {
    throw new Error('bad handshake response from APIm');
  }

  var key = crypto.privateDecrypt(
    { key: private_key,
      padding: constants.RSA_PKCS1_PADDING },
    new Buffer(body.key, 'base64')
  );

  var iv = new Buffer(16);
  iv.fill(0);
  var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  var plainText = decipher.update(body.cipher, 'base64', 'utf8');
  plainText += decipher.final('utf8');

  log.debug('handshake response payload:', plainText);
  return JSON.parse(plainText);
}

/**
 * Compute the signature headers "date", "digest", and "authorization" headers
 * according to IETF I-D draft-cavage-http-signatures-05 using rsa-sha256 algorithm
 *
 * If the `date` header already exists in the input, it's used as-is
 * If the `digest` header already exists in the input, it's used as-is (which means that body is ignored)
 *
 *
 * @param body (String): Message body (ignored if there is already a digest header)
 * @param headers (Object): Contains the existing list of headers
 * @param keyId (String): Identifier for the private key, ends up in the "keyId" param of the authorization header
 * @param key (String): RSA Private key to be used for the signature
 * @returns {*}
 */
function addSignatureHeaders(body, headers, keyId, key) {
  if (!headers) {
    headers = {};
  }

  if (!headers.date) {
    headers.date = (new Date()).toUTCString();
  }

  if (!headers.digest) {
    headers.digest = 'SHA256=' + hashMsg(JSON.stringify(body), 'sha256')
        .toString('base64');
  }


  var combine = function(names, headers) {
    var parts = [];
    names.forEach(function(e) {
      parts.push(e + ': ' + headers[e]);
    });
    return parts.join('\n');
  };

  headers.authorization = 'Signature ' +
    'keyId="' + keyId + '", ' +
    'headers="date digest", ' +
    'algorithm="rsa-sha256", ' +
    'signature="' +
    signMsg(combine([ 'date', 'digest' ], headers), key, 'RSA-SHA256')
      .toString('base64') + '"';

  return headers;
}


/**
 * Attempt to handshake from APIm server
 * @param {Object} apim - configuration pointing to APIm server
 * @param {string} privKey - private key to be used for handshake
 * @param {callback} doneCB - done callback
 */
exports.handshakeWithAPIm = function(apim, privKey, doneCB) {
  log.debug('handshakeWithAPIm entry');

  if (privKey instanceof Function) {
    doneCB = privKey;
    try {
      privKey = fs.readFileSync(path.resolve(__dirname, '..', env.KEYNAME));
    } catch (e) {
      doneCB(new Error('can not load default private key'));
      return;
    }
  }

  new Promise(function(resolve, reject) {
    var body = JSON.stringify({ gatewayVersion: version });

    var headers = { 'content-type': 'application/json' };

    addSignatureHeaders(body, headers,
        'micro-gw-catalog/' + apim.catalog, privKey);

    if (log.debug()) {
      log.debug(JSON.stringify(headers, null, 2));
    }

    var apimHandshakeUrlObj = {
      protocol: 'https',
      hostname: apim.host,
      port: apim.port,
      pathname: '/v1/catalogs/' + apim.catalog + '/handshake/' };

    var targetURL = url.format(apimHandshakeUrlObj);

    var options = {
      url: targetURL,
      method: 'POST',
      json: body,
      headers: headers,
      //FIXME: need to eventually remove this
      agentOptions: { rejectUnauthorized: false } };

    request(options,
      function(err, res, body) {
        if (err) {
          reject(new Error(
              'Failed to communicate with %s: %s ' + targetURL + err));
          return;
        }

        log.debug('statusCode: ' + res.statusCode);
        if (res.statusCode !== 200) {
          reject(new Error(targetURL + ' failed with: ' + res.statusCode));
          return;
        }

        try {
          var json = decryptAPIMResponse(body, privKey);

          if (!json || !json.microGateway) {
            throw new Error(
                targetURL + ' response did not contain "microGateway" section');
          }
          //{cert: cert, key:key, clientID:clientID}
          resolve(json.microGateway);
        } catch (e) {
          reject(e);
        }

      }
    ); //request end

  })
  .then(function(result) {
    log.info('Successful handshake with API Connect server');
    doneCB(undefined, { clientID: result.clientID });
    log.debug('handshakeWithAPIm exit');
  })
  .catch(function(error) {
    log.error('Unsuccessful handshake with API Connect server');
    doneCB(error);
  });

};
