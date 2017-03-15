// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

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
