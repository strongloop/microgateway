// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:oauth:az-server:middleware:custom-login-form' });
var retrieveCustomForm = require('./utils').retrieveForm;
var AuthorizationError = require('../../errors/authorizationerror');

var FORM_ACTION = 'action="authorize"';
var HIDDEN_FIELDS = '<EI-INJECT-HIDDEN-INPUT-FIELDS/>';
//var CUSTOM_FORM_ERROR = '<EI-INTERNAL-CUSTOM-FORM-ERROR/>';

module.exports = function(config) {
  config = config || {};
  var url = config.url;
  var tlsProfile = config.tlsProfile;
  var customPage;
  var pendingRequest = [];
  var loadingError;

  retrieveCustomForm(url, tlsProfile, [ FORM_ACTION, HIDDEN_FIELDS ],
      function(error, page) {
        if (page) {
          customPage = new CustomForm(page);
        }
        loadingError = error;
        for (var index = 0, len = pendingRequest.length; index < len; index++) {
          pendingRequest[index]();
        }
        pendingRequest = undefined;
      }
  );

  var customFormHandler = function(req, resp, next) {
    var oauth2 = req.oauth2;
    var ctx = req.ctx;

    if (_.isUndefined(oauth2.client.logined)) {
      //first login
      oauth2.client.logined = false;
      ctx.message.body = composeCustomForm(customPage, req, true);
    } else if (oauth2.client.logined === true) {
      //already logined skip;
      return next();
    } else {
      ctx.message.body = composeCustomForm(customPage, req, false);
    }
    //reset all headers
    ctx.message.headers = { 'Content-Type': 'text/html' };
    next('route');
  };

  return function(req, resp, next) {
    if (_.isUndefined(customPage)) {
      if (loadingError) {
        logger.error('Unable to load the custom login form.', loadingError);
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
    inputs: hiddenInputs(oauth2) };

  if (first === true) {
    options.firstLogin = true;
  } else {
    options.loginFailed = true;
  }

  return page.render(options);
}

function hiddenInputs(oauth2) {
//  var inputs = {
//    response_type: oauth2.req.type,
//    client__id: oauth2.req.clientID,
//    state: '',
//    redirect_uri: oauth2.redirectURI,
//  };
  //directly write out the hidden inputs here
  return '<input type="hidden" name="transaction_id" value="' +
    oauth2.transactionID + '"/>' +
    '<input type="hidden" name="response_type" value="' +
    oauth2.req.type + '"/>' +
    '<input type="hidden" name="client_id" value="' +
    oauth2.req.clientID + '"/>' +
    '<input type="hidden" name="redirect_uri" value="' +
    oauth2.redirectURI + '"/>' +
    '<input type="hidden" name="state" value=""/>' +
    '<input type="hidden" name="original-url" value=""/>';
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
  this._placeHolderIndex = { action: 0, firstLogin: 0, loginFailed: 0, input: 0 };

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

  page = page.replace(HIDDEN_FIELDS,
      '=#####cf-inputs=#####');

  var pieces = page.split('=#####');
  for (var index = 0, len = pieces.length; index < len; index++) {
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
};

