// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var crypto = require('crypto');
var qs = require('qs');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:security-check:eval-apikey' });

function evalApikey(ctx, descriptor, securityReq, securityDef, callback) {
  logger.debug('evalApikey entry. securityDefinition=', securityDef);

  var result = false;
  var queryParms = qs.parse(ctx.request.querystring);
  var secret;
  if (securityDef.in === 'header') {
    // Check arbitrary client ID header name/value
    if (securityDef['x-ibm-apikey'] && securityDef['x-ibm-apikey'] === 'clientid') {
      if (ctx.request.headers[securityDef.name.toLowerCase()] === descriptor['client-id']) {
        result = true;
      }
    // Check arbitrary client secret header name/value
    } else if (securityDef['x-ibm-apikey'] && securityDef['x-ibm-apikey'] === 'clientsecret') {
      if (getHashedValue(ctx.request.headers[securityDef.name.toLowerCase()]) === descriptor['client-secret']) {
        result = true;
        secret = ctx.request.headers[securityDef.name.toLowerCase()];
      }
    // Check fixed client ID header name/value
    } else if (securityDef.name === 'X-IBM-Client-Id') {
      if (ctx.request.headers['x-ibm-client-id'] === descriptor['client-id']) {
        result = true;
      }
    // Check fixed client secret header name/value
    } else if (securityDef.name === 'X-IBM-Client-Secret') {
      if (getHashedValue(ctx.request.headers['x-ibm-client-secret']) === descriptor['client-secret']) {
        result = true;
        secret = ctx.request.headers['x-ibm-client-secret'];
      }
    }
  } else if (securityDef.in === 'query') {
    // Check arbitrary client ID query parm name/value
    if (securityDef['x-ibm-apikey'] && securityDef['x-ibm-apikey'] === 'clientid') {
      if (queryParms[securityDef.name] === descriptor['client-id']) {
        result = true;
      }
    // Check arbitrary client secret query parm name/value
    } else if (securityDef['x-ibm-apikey'] && securityDef['x-ibm-apikey'] === 'clientsecret') {
      if (queryParms[securityDef.name] &&
          getHashedValue(queryParms[securityDef.name]) === descriptor['client-secret']) {
        result = true;
        secret = queryParms[securityDef.name];
      }
    // Check fixed client ID query parm name/value
    } else if (securityDef.name === 'client_id') {
      if (queryParms.client_id === descriptor['client-id']) {
        result = true;
      }
    // Check fixed client secret query parm name/value
    } else if (securityDef.name === 'client_secret') {
      if (getHashedValue(queryParms.client_secret) === descriptor['client-secret']) {
        result = true;
        secret = descriptor['client-secret'];
      }
    }
  }

  logger.debug('evalApikey result:', result);
  callback(result, secret);
}

function getHashedValue(s) {
  if (!s) {
    return s;
  } else {
    return crypto.createHash('sha256').update(s).digest('base64');
  }
}

module.exports = { evalApikey: evalApikey };
