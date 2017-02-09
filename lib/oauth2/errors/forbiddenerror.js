// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var util = require('util');
/**
 * `ForbiddenError` error.
 *
 * @api public
 */
function ForbiddenError(message) {
  Error.call(this);
  Error.captureStackTrace(this, ForbiddenError);
  this.name = 'ForbiddenError';
  this.message = message;
  this.status = 403;
}

/**
 * Inherit from `Error`.
 */
util.inherits(ForbiddenError, Error);

/**
 * Expose `ForbiddenError`.
 */
module.exports = ForbiddenError;
