// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:server:boot:check-security' });

/**
 * Validates that apiKey swagger security requirements meet APIConnect specs.
 * Input is a swagger doc, output is true (valid) or false (invalid).
 */
module.exports = function checkSecurity(apidoc) {
  logger.debug('checkSecurity entry');
  var securityReqs = apidoc.security;
  if (!securityReqs) {
    return true;
  }
  var securityDefs = apidoc.securityDefinitions;
  var name = (apidoc.info && apidoc.info['x-ibm-name']) || 'unnamed';
  logger.debug(name + ': checkSecurity securityReqs:', securityReqs);
  logger.debug(name + ': checkSecurity securityDefs:', securityDefs);

  var result = true;

  // Iterate over the security req's, they are OR'ed together and the checking
  // is applied to each one separately
  for (var req = 0; req < securityReqs.length; req++) {
    var securityReq = securityReqs[req];
    logger.debug(name + ': checkSecurity securityReq:', securityReq);

    // Iterate over each security scheme within this requirement.  They are
    // AND'ed together when the requirement is evaluated
    var keys = Object.keys(securityReq);
    var nQueryIds = 0;
    var nQuerySecrets = 0;
    var nQueryExtIds = 0;
    var nQueryExtSecrets = 0;
    var nHeaderIds = 0;
    var nHeaderSecrets = 0;
    var nHeaderExtIds = 0;
    var nHeaderExtSecrets = 0;
    var nQueryOther = 0;
    var nHeaderOther = 0;

    for (var def = 0; def < keys.length; def++) {
      var securityDefName = keys[def];
      logger.debug(name + ': checkSecurity securityDefName:', securityDefName);
      var securityDef = securityDefs[securityDefName];
      if (securityDef) {
        if (securityDef.type === 'apiKey') {
          // Examine this security scheme against its definition
          logger.debug(name + ': checkSecurity securityDef:', securityDef);
          if (securityDef.in === 'header') {
            if (securityDef.name === 'X-IBM-Client-Id') {
              nHeaderIds++;
            } else if (securityDef.name === 'X-IBM-Client-Secret') {
              nHeaderSecrets++;
            } else if (securityDef['x-ibm-apikey'] !== undefined) {
              if (securityDef['x-ibm-apikey'] === 'clientid') {
                nHeaderExtIds++;
              } else if (securityDef['x-ibm-apikey'] === 'clientsecret') {
                nHeaderExtSecrets++;
              } else {
                logger.warning(name + ': invalid x-ibm-apikey ' + securityDef['x-ibm-apikey'] +
                               ' in securityDefinition: ' + securityDefName + ' ignored');
              }
            } else {
              nHeaderOther++;
            }
          } else if (securityDef.in === 'query') {
            if (securityDef.name === 'client_id') {
              nQueryIds++;
            } else if (securityDef.name === 'client_secret') {
              nQuerySecrets++;
            } else if (securityDef['x-ibm-apikey'] !== undefined) {
              if (securityDef['x-ibm-apikey'] === 'clientid') {
                nQueryExtIds++;
              } else if (securityDef['x-ibm-apikey'] === 'clientsecret') {
                nQueryExtSecrets++;
              } else {
                logger.warning(name + ': invalid x-ibm-apikey ' + securityDef['x-ibm-apikey'] +
                               ' in securityDefinition: ' + securityDefName + ' ignored');
              }
            } else {
              nQueryOther++;
            }
          } else {
            // Invalid swagger - bad "in" type
            logger.error(name + ': invalid securityDefinition: ' + securityDefName +
                         ' invalid in: ' + securityDef.in);
            result = false;
          }
        }
      } else {
        // Invalid swagger - missing securityDefinition
        logger.error(name + ': missing securityDefinition: ' + securityDefName);
        result = false;
      }
    }

    // You cannot apply more than two API key security schemes to an API.
    if (nQueryIds + nQuerySecrets + nQueryExtIds + nQueryExtSecrets +
        nHeaderIds + nHeaderSecrets + nHeaderExtIds + nHeaderExtSecrets > 2) {
      logger.error(name + ': security requirement contains more than two API ' +
                   'key security schemes');
      result = false;
    }

    // If you apply an API key security scheme for client secret, you must also
    // apply an API key security scheme for client ID.
    if ((!nQueryIds && nQuerySecrets) || (!nHeaderIds && nHeaderSecrets) ||
        (!nQueryExtIds && nQueryExtSecrets) || (!nHeaderExtIds && nHeaderExtSecrets)) {
      logger.error(name + ': security requirement contains an API key ' +
                   'security scheme for client secret but none for client ID');
      result = false;
    }

    // If you require the application developer to supply both client ID and
    // client secret, you must apply two separate API key security schemes.
    // THIS IS IMPLIED

    // You can have at most one API key scheme of type client ID, regardless of
    // whether the client ID is sent in the request header or as a query
    // parameter.
    if (nQueryIds + nQueryExtIds + nHeaderIds + nHeaderExtIds > 1) {
      logger.error(name + ': security requirement contains more than one API ' +
                   'key scheme of type client ID');
      result = false;
    }

    // You can have at most one API key scheme of type client secret,
    // regardless of whether the client secret is sent in the request header
    // or as a query parameter.
    if (nQuerySecrets + nQueryExtSecrets + nHeaderSecrets + nHeaderExtSecrets > 1) {
      logger.error(name + ': security requirement contains more than one API ' +
                   'key scheme of type client secret');
      result = false;
    }
  }

  return result;
};
