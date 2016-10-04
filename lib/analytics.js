// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/*eslint-env node */
'use strict';
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:analytics' });
var request = require('request');
var qs = require('querystring');
var url = require('url');
var _ = require('lodash');
var util = require('util');

var env = require('../utils/environment');
var utils = require('../utils/utils');

var DEFAULT_INTERVAL = 3; //3 seconds
var DEFAULT_SIZE = 50; //50 transactions

var pushQueue = [];
var pushInterval;
var queueSize;
var requestOptions;
var serverURI;
var pushTimer;
var clientID = '';
var disabled = false; //default to enable the analytics feature

//need the following information to monkey path the HttpParser
//for the socket.bytesRead
var version = (function() {
  var match = process.version.match(/v(\d+)\.(\d+)\.(\d+)/);
  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3], 10) ];
}());

var mkPatch = version[0] > 0;

module.exports = function sendAnalytics(opts) {
  pushInterval = opts.batchInterval || DEFAULT_INTERVAL;
  queueSize = opts.batchSize || DEFAULT_SIZE;
  requestOptions = opts.requestOptions || getRequestOptions();
  serverURI = opts.url || getServerURI();
  logger.debug('serverURI:', serverURI);
  performHandshake();

  return function captureActivity(req, res, next) {
    //only enable analytics when
    //1. if we know where to send the statistics
    //2. handshake finished
    //3. not be disabled
    //TODO: maybe check a specific context variable also. i.e. api.analytics.on
    if (serverURI && clientID.length > 0 && !disabled) {
      res.on('finish', function() {
        if (!_.isUndefined(req.ctx.api)) {
          var duration = new Date() - req.ctx.request.date;
          processActivity(req, res, duration, opts);
        }
      });
    }

    next();
  };
};

function processActivity(req, res, duration, opts) {
  var event = buildApiEvent(req, res, duration);
  processApiEvent(event, opts);
}

/*
 Here is a sample packet. We should buffer up X number and use
 the elasticsearch _bulk operation
{
   "remoteHost" : "9.20.85.123",
   "resourceId" : "542018d9e4b0f87216fdc8c5",
   "apiUser" : "542016d6e4b0f87216fdc806",
   "responseBody" : "",
   "statusCode" : "200 OK",
   "debug" : [],
   "bytesReceived" : 0,
   "bytesSent" : 57,
   "datetime" : "2014-09-19T13:45:34.349Z",
   "responseHttpHeaders" : [],
   "requestBody" : "",
   "source" : "9.20.85.122",
   "orgId" : "542016d6e4b0f87216fdc806",
   "spaceId" : [],
   "timeToServeRequest" : 2989,
   "requestHttpHeaders" : [],
   "planId" : "54201a9de4b0f87216fdc8d3",
   "userAgent" : "IBM-APIManagement/3.0 Test-Tool/1.0",
   "logPolicy" : "activity",
   "requestMethod" : "GET",
   "appId" : "542016dde4b0f87216fdc80f",
   "apiVersion" : 1,
   "uriPath" : "/capitalone/sb/rest/node/9.174.20.202/location",
   "requestProtocol" : "https",
   "apiId" : "5420184ee4b0f87216fdc83f",
   "envId" : "542016d9e4b0f87216fdc808",
   "planVersion" : 1,
   "queryString" : [],
   "transactionId" : "82168384"
}
*/
function buildApiEvent(req, res, duration) {
  var urlParts = url.parse(req.originalUrl || req.url);
  var query = qs.parse(urlParts.query);
  var queryArray = Object.keys(query).map(function(k) {
    var item = Object.create(null);
    item[k] = query[k];
    return item;
  });
  //use ctx.get() to avoid undefined issue
  //in some cases, certain context variables are not
  //populated into ctx yet,i.e. error paths.
  var ctx = req.ctx;
  var planId = ctx.get('plan.id') || '';
  var planIdTokens = planId.split(':');
  var resourceId = util.format('%s:%s:%s:%s', ctx.api.name,
      ctx.api.version, ctx.request.verb.toLowerCase(), ctx._.api.path);

  return {
    requestMethod: req.method,
    uriPath: urlParts.pathname,
    queryString: queryArray,
    transactionId: ctx.get('request.tid'),
    statusCode: String(res.statusCode),
    timeToServeRequest: duration,
    source: req.socket.localAddress,
    remoteHost: req.ip || req.connection.remoteAddress,
    datetime: req.ctx.request.date,
    userAgent: req.headers['user-agent'] || '',
    requestProtocol: req.connection.encrypted ? 'https' : 'http',
    bytesSent: req.socket.bytesWritten,
    bytesReceived: req.socket.bytesRead ? req.socket.bytesRead : req.socket._bytesRead,
    apiVersion: ctx.get('api.version'),
    orgId: ctx.get('api.org.id') || '',
    spaceId: ctx.get('_apis.spaceIds') || [],
    envId: process.env[env.APIMANAGER_CATALOG] || '',
    apiId: ctx.get('_.api.id') || '',
    appId: ctx.get('client.app.id') || '',
    resourceId: resourceId,
    apiUser: ctx.get('client.org.id') || '',
    responseBody: '',
    requestBody: '',
    responseHttpHeaders: [],
    requestHttpHeaders: [],
    debug: [],
    planId: planId,
    planVersion: ctx.get('plan.version') || '',
    productName: planIdTokens[0] || '',
    productVersion: planIdTokens[1] || '',
    logPolicy: '' };
}

function processApiEvent(event) {
  var data = [ {
    create: {
      _type: 'apievent',
      _index: event.orgId } },
    event ].map(JSON.stringify).join('\n');

  if (logger.debug()) {
    logger.debug('Analytics Data:%s', maskQueryString(data));
  }

  pushQueue.push(data);
  if (pushQueue.length >= queueSize) {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = undefined;
    }
    batchPublish();
  } else if (_.isUndefined(pushTimer)) {
    pushTimer = setTimeout(batchPublish,
        pushInterval * 1000);
    logger.debug('push timer starts');
  }
}

function batchPublish() {
  var opts = {
    url: serverURI,
    agentOptions: requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ORGANIZATION: 'admin',
      'X-Target': 'analytics-lb' },
    qs: { client_id: clientID },
    body: pushQueue.join('\n') + '\n' };

  pushQueue.length = 0;

  logger.debug('Uploading to %s\n', opts.url);
  try {
    request.post(opts, function(err, res) {
      if (err) {
        return logger.error('Cannot upload analytics events', err);
      }
      if (res.statusCode >= 400) {
        return logger.error('Cannot upload analytics events: status code %s\n%s',
            res.statusCode, res.body);
      }
    });
  } catch (e) {
    logger.debug('error while sending analytics event:', e);
  }
  pushTimer = undefined;
}

function getServerURI() {
  if (process.env[env.APIMANAGER] &&
      process.env[env.APIMANAGER_PORT] &&
      process.env[env.APIMANAGER_CATALOG]) {

    return 'https://' + process.env[env.APIMANAGER] +
      ':' + process.env[env.APIMANAGER_PORT] + '/v1/catalogs/' +
      process.env[env.APIMANAGER_CATALOG] + '/analytics';
  }
  return undefined;
}

/*
 * mask query string in debug message
 */
function maskQueryString(data) {
  return data.replace(/"queryString":.*?,/, '"queryString":****,');
}

function getRequestOptions() {
  var options = utils.getTLSConfigSync();
  options.rejectUnauthorized = false;
  return options;
}

/**
 * call APIm handshake API to get clientID
 */
function performHandshake() {
  var apim = {
    host: process.env[env.APIMANAGER],
    port: process.env[env.APIMANAGER_PORT],
    catalog: process.env[env.APIMANAGER_CATALOG],
  };

  utils.handshakeWithAPIm(apim, function(error, result) {
    if (error) {
      logger.error('not able to perform the handshake with APIM, error:', error);
    } else {
      clientID = result.clientID;
    }
  });
}

module.exports.mkPatch = mkPatch;

//enable the analytics feature
module.exports.enable = function() {
  disabled = false;
};

//disable the analytics feature
module.exports.disable = function() {
  disabled = true;
};
