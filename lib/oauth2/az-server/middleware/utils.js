// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var urlparser = require('url');
var _ = require('lodash');
var assert = require('assert');
var protocols = [ require('http'), require('https') ];

var logger = require('apiconnect-cli-logger/logger.js')
  .child({ loc: 'microgateway:oauth:az-server:middleware:utils' });
/**
 * retrieve the page from the url.
 * @param tlsProfile tls profile object. optional
 * @param validations array of strings that must
 *        exist in the page. optional
 * @param done done callback: function(error, page)
 */
exports.retrieveForm = function(url, tlsProfile, validations, done) {
  var options = urlparser.parse(url);
  var isSecured = options.protocol === 'https:';
  var http = isSecured ? protocols[1] : protocols[0];
  options.headers = { 'User-Agent': 'APIConnect/5.0 (MicroGateway)' };

  if (arguments.length === 2) {
    //(url, done)
    done = tlsProfile;
    validations = [];
    tlsProfile = undefined;
  } else if (arguments.length === 3) {
    //(url, tlsProfile, done) or (url, validations, done)
    done = validations;
    if (_.isArray(tlsProfile)) {
      validations = tlsProfile;
      tlsProfile = undefined;
    } else {
      validations = [];
    }
  }

  assert(_.isArray(validations), 'validations shall be an array');

  if (isSecured) {
    options.agent = false; // do we really want to set this?  no conn pooling
    options.rejectUnauthorized = false;
    if (tlsProfile) {
      //key
      options.key = tlsProfile['private-key'];

      //cert
      for (var c in tlsProfile.certs) {
        if (tlsProfile.certs[c]['cert-type'] === 'PUBLIC') {
          options.cert = tlsProfile.certs[c].cert;
          break;
        }
      }

      //ca list
      options.ca = [];
      for (var p in tlsProfile.certs) {
        if (tlsProfile.certs[p]['cert-type'] === 'CLIENT') {
          logger.debug('uses the ca.name: %s',
                      tlsProfile.certs[p].name);
          options.ca.push(tlsProfile.certs[p].cert);

        }
      }

      if (options.ca.length > 0 || tlsProfile['mutual-auth']) {
        options.rejectUnauthorized = true;
        logger.debug('rejectUnauthorized = true');
      }
      //secureProtocol
      if (tlsProfile.protocols && Array.isArray(tlsProfile.protocols)) {
        for (var j = 0; j < tlsProfile.protocols.length; j++) {
          switch (tlsProfile.protocols[j]) {
            case 'TLSv1':
              options.secureProtocol = 'TLSv1_method';
              break;
            case 'TLSv11':
              options.secureProtocol = 'TLSv1_1_method';
              break;
            case 'TLSv12':
              options.secureProtocol = 'TLSv1_2_method';
              break;
            default:
              logger.warn('unsupported secure protocol: %s',
                          tlsProfile.protocols[j]);
              break;
          }
          if (options.secureProtocol) {
            break;
          }
        }
      }

      //use default ciphers
      options.honorCipherOrder = true;
      options.ciphers = 'HIGH:MEDIUM:!aNULL:!eNULL:!RC4:@STRENGTH';
    }
  }

  var request = http.request(options, function(response) {
    if (response.statusCode !== 200) {
      logger.error('Failed to retrieve form. Status code:', response.statusCode);
      return done('failed to retrive the form');
    }

    var chunks = [];
    response.setEncoding('utf8');
    response.on('data', function(data) {
      chunks.push(data);
    });
    response.on('end', function() {
      var page = chunks.join();
      for (var index = 0, len = validations.length; index < len; index++) {
        if (page.indexOf(validations[index]) === -1) {
          return done(validations[index] + ' not found');
        }
      }
      return done(null, page);
    });
    //handle processing error
    response.on('error', function(error) {
      return done(error);
    });

  });

  //handle error connection
  request.on('error', function(error) {
    return done(error);
  });
  request.end();
};
