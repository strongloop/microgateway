'use strict';
var debug = require('debug')('micro-gateway:analytics');
var request = require('request');
var qs = require('querystring');
var url = require('url');
var _ = require('lodash');

var DEFAULT_INTERVAL = 3; //3 seconds
var DEFAULT_SIZE = 50; //50 transactions

var pushQueue = [];
var pushInterval;
var queueSize;
var requestOptions;
var serverURI;
var pushTimer;

module.exports = function sendAnalytics(opts) {
  pushInterval = opts.batchInterval || DEFAULT_INTERVAL;
  queueSize    = opts.batchSize ||  DEFAULT_SIZE;
  requestOptions = opts.requestOptions || {};
  serverURI    = opts.url || getServerURI();
  debug('serverURI:', serverURI);

  return function captureActivity(req, res, next) {
    //only enable analytics if we know where to send
    //the statistics
    if (serverURI) {
      res.on('finish', function() {
        var duration = new Date() - req.ctx.request.date;
        processActivity(req, res, duration, opts);
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
    bytesSent: 0,
    bytesReceived: 0,
    apiVersion: ctx.get('api.version'),
    orgId: ctx.get('api.org.id') || '',
    envId: ctx.get('catalog.id') || '',
    apiId: ctx.get('api.id') || '',
    appId: ctx.get('client.app.id') || '',
    resourceId: '',
    apiUser: '',
    responseBody: '',
    requestBody: '',
    responseHttpHeaders: [],
    requestHttpHeaders: [],
    debug: [],
    planId: ctx.get('plan.id') || '',
    planVersion: ctx.get('plan.version') || '',
    logPolicy: '',
  };
}

function processApiEvent(event) {
  var data = [
        {
          create: {
            _type: 'apievent',
            _index: event.orgId
          }
        },
        event,
      ].map(JSON.stringify).join('\n') + '\n';
  debug('Analytics Data:%s', data);
  pushQueue.push(data);
  if (pushQueue.length >= queueSize) {
    clearTimeout(pushTimer);
    batchPublish();
  } else if (_.isUndefined(pushTimer)){
    pushTimer = setTimeout(batchPublish,
        pushInterval*1000);
    debug('push timeer starts')
  }
}

function batchPublish() {
  var opts = {
      url: serverURI,
      agentOptions: requestOptions,
      body: pushQueue.join('\n') + '\n',
  };

  debug('Uploading to %s\n%s', opts.url, opts.body);
  try {
    request.post(opts, function(err, res) {
      if (err) {
        return debug('Cannot upload analytics events', err);
      }
      if (res.statusCode >= 400) {
        return debug('Cannot upload analytics events: status code %s\n%s',
            res.statusCode, res.body);
      }
    });
  } catch (e) {
    debug('error while sending analytics event:', e);
  }
  pushTimer = undefined;
}

function getServerURI() {
  if (process.env.APIMMANAGER) {
    return 'https://' + process.env.APIMMANAGER +
      ':9443/x2020/v1/events/_bulk';
  }
  return undefined;
}