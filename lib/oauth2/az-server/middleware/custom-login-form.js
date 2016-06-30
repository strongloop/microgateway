// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var fs = require('fs');
var path = require('path');
var urlparser = require('url');
var _ = require('lodash');

var AuthorizationError = require('../../errors/authorizationerror');

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
  var pendingRequest = [];
  var loadingError;
  
  retrieveCustomForm(url, tlsProfile, function(error, page) {
    if (page) {
      customPage = new CustomForm(page);
    }
    loadingError = error;
    for(var index = 0, len = pendingRequest.length; index < len; index++) {
      pendingRequest[index]();
    }
    pendingRequest = undefined;
  });

  var customFormHandler = function(req, resp, next) {
    var oauth2 = req.oauth2;
    var ctx = req.ctx;

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

  return function (req, resp, next) {

    if (_.isUndefined(customPage)) {
      if (loadingError) {
        return next(new AuthorizationError('Unable to load the custom form',
          'server_error'));
      } else {
        //queuing up the requests while retrieving custom form
        pendingRequest.push(function() {
          customFormHandler(req, resp, next);
        });
        return;
      }
    }
    customFormHandler(req, resp, next);
  };
};

function composeCustomForm(page, req, first) {
  var oauth2 = req.oauth2;
  var ctx = req.ctx;
  var options = {
    action: ctx.request.path + ctx.request.search,
    inputs: '<input type="hidden", size="1024", name="transaction_id", value="' + 
      oauth2.transactionID + '"/>' 
  };
  if (first === true) {
    options.firstLogin = true;
  } else {
    options.loginFailed = true;
  }
  return page.render(options);
}

function retrieveCustomForm(url, tlsProfile, done) {
  var options = urlparser.parse(url);
  var isSecured = options.protocol === 'https:';
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

/**
 * A simple implementation to tokenlize the html string
 * and record the placeholder index and replace them
 * for each transaction.
 */
function CustomForm(page) {
  this._pieces = [];
  this._error;
  this._firstLogin;
  this._loginFailed;
  var _this = this;
  this._action;
  this._inputs;
  this._placeHolderIndex = 
      {action: 0, firstLogin: 0, loginFailed: 0, input: 0};

  page = page.replace('action="authorize"', 'action="=#####cf-action=#####"');
  page = page.replace(/<EI-LOGINFIRSTTIME>([\s\S]*)<\/EI-LOGINFIRSTTIME>/,
      function() {
        _this._firstLogin = arguments[1];
        return '=#####cf-first=#####';
      });

  page = page.replace(/<EI-LOGINFAILED>([\s\S]*)<\/EI-LOGINFAILED>/, 
      function() {
        _this._loginFailed = arguments[1];
        return '=#####cf-loginFailed=#####';
      });
  
  page = page.replace('<EI-INJECT-HIDDEN-INPUT-FIELDS/>', 
      '=#####cf-inputs=#####');

  var pieces = page.split('=#####');
  for(var index = 0, len = pieces.length; index < len; index++) {
    switch (pieces[index]) {
    case 'cf-action':
      this._placeHolderIndex.action = index;
      break;
    case 'cf-first':
      this._placeHolderIndex.firstLogin = index;
      break;
    case 'cf-loginFailed':
      this._placeHolderIndex.loginFailed = index;
      break;
    case 'cf-inputs':
      this._placeHolderIndex.inputs = index;
      break;
    default:
      break;
    }
  }
  this._pieces = pieces;
}

CustomForm.prototype.render = function(options) {
  this._pieces[this._placeHolderIndex.action] = options.action || '';
  this._pieces[this._placeHolderIndex.inputs] = options.inputs || '';
  if (options.firstLogin === true) {
    this._pieces[this._placeHolderIndex.firstLogin] = this._firstLogin;
    this._pieces[this._placeHolderIndex.loginFailed] = '';
  }
  if (options.loginFailed === true) {
    this._pieces[this._placeHolderIndex.firstLogin] = '';
    this._pieces[this._placeHolderIndex.loginFailed] = this._loginFailed;
  }
  return this._pieces.join('');
}

