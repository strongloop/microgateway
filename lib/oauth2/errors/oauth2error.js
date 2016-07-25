// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

/**
 * `OAuth2Error` error.
 *
 * @api public
 */
function OAuth2Error(message, code, uri, status) {
  Error.call(this);
  this.message = message;
  this.code = code || 'server_error';
  this.uri = uri;
  this.status = status || 500;
}

/**
 * Inherit from `Error`.
 */
Object.setPrototypeOf(OAuth2Error.prototype, Error.prototype);


/**
 * Expose `OAuth2Error`.
 */
module.exports = OAuth2Error;
