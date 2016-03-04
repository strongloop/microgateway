'use strict';
var debug = require('debug')('micro-gateway:analytics');
var request = require('request');
var qs = require('querystring');
var url = require('url');
var uuid = require('uuid');

module.exports = function sendAnalytics(opts) {
  return function captureActivity(req, res, next) {
    res.on('finish', function() {
      var duration = new Date() - req.ctx.request.date;
      processActivity(req, res, duration, opts);
    });
    next();
  };
};

function processActivity(req, res, duration, opts) {
  var event = buildApiEvent(req, res, duration);
  publishApiEvent(event, opts);
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
    remoteHost: req.ctx.request.clientip,
    datetime: req.ctx.request.date,
    userAgent: req.headers['user-agent'] || '',
    requestProtocol: req.connection.encrypted ? 'https' : 'http',
    bytesSent: 0,
    bytesReceived: 0,
    apiVersion: '',
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
    logPolicy: '',
  };
}

function publishApiEvent(event, config) {
  var opts = {
    url: config.url || 'http://localhost:8889/analytics',
    agentOptions: config.requestOptions,
    body: [
      {
        create: {
          _type: 'apievent',
          _index: config.orgId
        }
      },
      event,
    ].map(JSON.stringify).join('\n') + '\n',
  };
  debug('Uploading to %s\n%s', opts.url, opts.body);
  request.post(opts, function(err, res) {
    if (err) {
      return debug('Cannot upload analytics events', err);
    }
    if (res.statusCode >= 400) {
      return debug('Cannot upload analytics events: status code %s\n%s',
                   res.statusCode, res.body);
    }
  });
}
