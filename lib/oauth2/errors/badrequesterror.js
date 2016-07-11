// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';

var util = require('util');

/**
 * `BadRequestError` error.
 *
 * @api public
 */
function BadRequestError(message) {
  Error.call(this);
  Error.captureStackTrace(this, BadRequestError);
  this.name = 'BadRequestError';
  this.message = message;
  this.status = 400;
}

/**
 * Inherit from `Error`.
 */
util.inherits(BadRequestError, Error);

/**
 * Expose `BadRequestError`.
 */
module.exports = BadRequestError;
