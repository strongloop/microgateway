// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var fs = require('fs');
var path = require('path');
var urlparser = require('url');
var _ = require('lodash');

var ACTIONURL = 'action="authorize"';
var HIDDEN_FIELDS = '<EI-INJECT-HIDDEN-INPUT-FIELDS/>';
var FIRSTTIME = 'EI-LOGINFIRSTTIME';
var LOGINFAILED = 'EI-LOGINFAILED';
var CUSTOM_FORM_ERROR = '<EI-INTERNAL-CUSTOM-FORM-ERROR/>';

module.exports = function (config) {
  config = config || {};
  var url = config.url;
  var tlsProfile = config.tlsProfile;
  var customPage;

  retrieveCustomForm(url, tlsProfile, function(error, page) {
    customPage = page;
  });

  return function (req, resp, next) {
    var oauth2 = req.oauth2;
    var ctx = req.ctx;

    if (_.isUndefined(customPage)) {
      return next(new Error('Unable to load the custom form'));
    }

    if (_.isUndefined(oauth2.client.logined)) {
      //first login
      oauth2.client.logined = false;
      ctx.message.body = composeCustomForm(customPage, req, true);
    } else if (oauth2.client.logined === true){
      //already logined skip;
      return next();
    } else {
      ctx.message.body = composeCustomForm(customPage, req, false);
    }
    //reset all headers
    ctx.message.headers = {'Content-Type': 'text/html'};
    next('route');
  };
};

function composeCustomForm(page, req, first) {
  var oauth2 = req.oauth2;
  var ctx = req.ctx;
  //dirty string replacement here
  //TODO: if possible, find other alternative to avoid
  //      repeatedly string replacement
  page = page.replace(HIDDEN_FIELDS, 
      '<input type="hidden", size="1024", name="transaction_id", value="' + 
      oauth2.transactionID + '"/>');
  page = page.replace(ACTIONURL, 'action="' + ctx.request.path + ctx.request.search + '"');
  if (first === true) {
    page = page.replace(/<\/{0,1}EI-LOGINFIRSTTIME>/g, '');
    page = page.replace(/<EI-LOGINFAILED>[\s\S]*<\/EI-LOGINFAILED>/, '');
  } else {
    page = page.replace(/<\/{0,1}EI-LOGINFAILED>/g, '');
    page = page.replace(/<EI-LOGINFIRSTTIME>[\s\S]*<\/EI-LOGINFIRSTTIME>/, '');
  }
  return page;
}

function retrieveCustomForm(url, tlsProfile, done) {
  var options = urlparser.parse(url);
  var isSecured = options.protocol === 'https';

  var http = isSecured ? require('https') : require('http');
  options.headers = {'User-Agent': 'APIConnect/5.0 (MicroGateway)'};

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
              logger.debug('[invoke] uses the ca.name: %s',
                      tlsProfile.certs[p].name);
              options.ca.push(tlsProfile.certs[p].cert);

          }
      }

      if (options.ca.length > 0 || tlsProfile['mutual-auth']) {
          options.rejectUnauthorized = true;
          logger.debug('[invoke] rejectUnauthorized = true');
      }
      //secureProtocol
      if (tlsProfile.protocols && Array.isArray(tlsProfile.protocols)) {
          for (var j=0; j<tlsProfile.protocols.length; j++) {
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
                  logger.warn('[invoke] unsupported secure protocol: %s',
                          tlsProfile.protocols[j]);
                  break;
              }
              if (options.secureProtocol)
                break;
          }
      }

      //use default ciphers
      options.honorCipherOrder = true;
      options.ciphers = 'HIGH:MEDIUM:!aNULL:!eNULL:!RC4:@STRENGTH';
    }
  }
  
  var request = http.request(options, function(response) {
    if (response.statusCode !== 200) {
      return done('Can not get custom login form');

    }

    var chunks = [];
    response.setEncoding('utf8');
    response.on('data', function(data) {
        chunks.push(data);
    });
    response.on('end', function() {
      var page = chunks.join();
      if (page.indexOf('action="authorize"') !== -1 && 
          page.indexOf(HIDDEN_FIELDS) !== -1) {
        return done(null, page);
      }
    });
  });
  request.end();
}
