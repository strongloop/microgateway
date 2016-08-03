// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var _ = require('lodash');

var handlebars = require('handlebars');
var htmlparser = require('htmlparser2');
var domutils = htmlparser.DomUtils;
var logger = require('apiconnect-cli-logger/logger.js')
    .child({ loc: 'microgateway:oauth:az-server:middleware:custom-login-form' });

var retrieveCustomForm = require('./utils').retrieveForm;
var AuthorizationError = require('../../errors/authorizationerror');

var FORM_ACTION = 'action="authorize"';
var HIDDEN_FIELDS = '<AZ-INJECT-HIDDEN-INPUT-FIELDS/>';
//var CUSTOM_FORM_ERROR = '<AZ-INTERNAL-CUSTOM-FORM-ERROR/>';

module.exports = function(config) {
  config = config || {};
  var url = config.url;
  var tlsProfile = config.tlsProfile;
  var customPage;
  var pendingRequest = [];
  var loadingError;
  var server = config.server;
  if (_.isUndefined(config.consentAgain)) {
    config.consentAgain = false;
  }

  //retrive the custom consent form, parse it and compile it
  retrieveCustomForm(url, tlsProfile, [ FORM_ACTION, HIDDEN_FIELDS ],
    function(error, page) {
      if (error) {
        loadingError = error;
        //call the queuing requests
        for (var index = 0, len = pendingRequest.length; index < len; index++) {
          pendingRequest[index]();
        }
        pendingRequest = undefined;
        return;
      }
      compileForm(page, function(error, form) {
        if (error) {
          loadingError = error;
        } else {
          customPage = form;
        }
        //call the queuing requests
        for (var index = 0, len = pendingRequest.length; index < len; index++) {
          pendingRequest[index]();
        }
        pendingRequest = undefined;
      });
    }
  );

  //handle the custom form per transaction
  var customFormHandler = function(req, resp, next) {
    if (loadingError) {
      logger.error('Unable to load the custom consent form.', loadingError);
      return next(new AuthorizationError('Unable to load the custom form',
        'server_error'));
    } else if (req.oauth2.res && req.oauth2.res.allow === true &&
        config.consentAgain === false) {
      server._respond(req.oauth2, req.ctx, function(err) {
        if (err && err !== 'route') {
          logger.error('Found errors in the server response handler:', err);
          return next(new AuthorizationError(
              'Found errors in the server response handler',
              'server_error'));
        }
        return next();
      });
    } else {
      var ctx = req.ctx;
      ctx.message.body = composeCustomForm(customPage, req);
      //reset all headers
      ctx.message.headers = { 'Content-Type': 'text/html' };
      next('route');
    }
  };

  return function(req, resp, next) {
    if (_.isUndefined(customPage) && _.isUndefined(loadingError)) {
      //queuing up the requests while retrieving custom form
      pendingRequest.push(function() {
        customFormHandler(req, resp, next);
      });
      return;
    }
    customFormHandler(req, resp, next);
  };
};

/*
 * Use the compiled form and transactional data
 * to generate the html of the custom form
 */
function composeCustomForm(page, req) {
  var oauth2 = req.oauth2;
  var ctx = req.ctx;
  /*
   * valid option:
   *     hidden input fields: actionUrl, dpState, dpData, resOwner, redirectUri
   *                          scope, originalUrl, clientId
   *     inject input fields: inputFields
   *     for display : dispResOwner, dispAppName, dispScope, dispRedirectUri,
   *                   dispError
   */
  var actionUrl = ctx.request.path + ctx.request.search;
  var scope = oauth2.req.scope.join(' ');
  var options = {
    actionUrl: actionUrl,
    dpState: oauth2.transactionID,
    clientId: oauth2.req.clientID,
    resOwner: oauth2.user.id,
    redirectUri: oauth2.redirectURI,
    originalUrl: actionUrl,
    scope: scope,
    dispResOwner: oauth2.user.id,
    dispAppName: oauth2.client.title,
    dispScope: scope,
    dispRedirectUri: oauth2.redirectURI,
  };
  return page(options);
}

/*
 * parse the custom form, replace specific element
 * compile it as handlerbars function
 */
function compileForm(page, done) {
  page = replaceOptionalElements(page);
  var handler = new htmlparser.DomHandler(function(error, dom) {
    if (error) {
      done(error);
    } else {
      var forms = domutils.findAll(findForm, dom);
      if (forms.length !== 1) {
        done('Need one form in the custom page');
        return;
      }
      //change form[@action] to {{actionUrl}}
      forms[0].attribs.action = '{{{actionUrl}}}';
      var inputs = domutils.findAll(findHiddenInput, forms);
      replaceInputValues(inputs);

      var html = htmlparser.DomUtils.getInnerHTML({ children: dom });
      done(undefined, handlebars.compile(html));
    }
  }, { normalizeWhitespace: true });
  var parser = new htmlparser.Parser(handler);
  parser.write(page);
  parser.done();
}

/*
 * filtering function for DomUtils to lookup the form
 */
function findForm(elem) {
  if (elem.name && elem.name === 'form' && elem.attribs) {
    var atts = elem.attribs;

    if (atts.enctype && atts.enctype === 'application/x-www-form-urlencoded' &&
        atts.method && atts.method.toLowerCase() === 'post' &&
        atts.action && atts.action === 'authorize') {

      //we got the form we want, find the approve and deny buttons
      var buttons = domutils.findAll(findButton, [ elem ]);
      var count = 0;
      buttons.forEach(function(one) {
        if (one.attribs.value === 'true') {
          count = count | 1;
        } else if (one.attribs.value === 'false') {
          count = count | 2;
        }
      });
      if (count === 3) {
        return true;
      } else {
        logger.error('Need the "approve" and "deny" buttons in the "form" element');
      }
    } else {
      logger.error('The "form" element needs correct "action", "method" and "enctype" attributes');
    }
  }
  return false;
}

/*
 * filtering function for DomUtils to lookup the buttons
 */
function findButton(elem) {
  if (elem.name && elem.name === 'button' && elem.attribs) {
    if (elem.attribs.name === 'approve') {
      return true;
    }
  }
  return false;
}

/*
 * filtering function for DomUtils to lookup the hidden inputs
 */
function findHiddenInput(elem) {
  if (elem.name && elem.name === 'input' && elem.attribs) {
    if (elem.attribs.type === 'hidden') {
      return true;
    }
  }
  return false;
}
/*
 * replace the following input elements' value as placeholder
 * <input type="hidden" name="dp-state"       value="A"/>
 * <input type="hidden" name="resource-owner" value="A"/>
 * <input type="hidden" name="dp-data" value="A"/>
 * <input type="hidden" name="redirect_uri"   value="A"/>
 * <input type="hidden" name="scope" value="A"/>
 * <input type="hidden" name="original-url" value="A"/>
 * <input type="hidden" name="client_id" value="A"/>
 */
function replaceInputValues(inputs) {
  for (var index = 0, len = inputs.length; index < len; index++) {
    var input = inputs[index];
    switch (input.attribs.name) {
      case 'dp-state':
        input.attribs.value = '{{{dpState}}}';
        break;
      case 'resource-owner':
        input.attribs.value = '{{{resOwner}}}';
        break;
      case 'dp-data':
        input.attribs.value = '{{{dpData}}}';
        break;
      case 'redirect_uri':
        input.attribs.value = '{{{redirectUri}}}';
        break;
      case 'scope':
        input.attribs.value = '{{{scope}}}';
        break;
      case 'original-url':
        input.attribs.value = '{{{originalUrl}}}';
        break;
      case 'client_id':
        input.attribs.value = '{{{clientId}}}';
        break;
      default:
        break;
    }
  }
}

/*
 * Need to replace these elements with placeholder first.
 * htmlparser2 seems have problem in handling these
 * self-closed elements sometimes.
 */
var optionalElements = {
  '<AZ-INJECT-HIDDEN-INPUT-FIELDS/>': '{{inputFields}}',
  '<DISPLAY-RESOURCE-OWNER/>': '{{dispResOwner}}',
  '<RESOURCE-OWNER/>': '{{dispResOwner}}',
  '<JOES-APPLICATION-NAME/>': '{{dispAppName}}',
  '<OAUTH-APPLICATION-NAME/>': '{{dispAppName}}',
  '<OAUTH-SCOPE/>': '{{dispScope}}',
  '<JOES-REDIRECT-URI/>': '{{dispRedirectUri}}',
  '<OAUTH-REDIRECT-URI/>': '{{dispRedirectUri}}',
  '<AZ-INTERNAL-CUSTOM-FORM-ERROR/>': '{{dispError}}' };

function replaceOptionalElements(html) {
  for (var pattern in optionalElements) {
    html = html.replace(pattern, optionalElements[pattern]);
  }
  return html;
}
