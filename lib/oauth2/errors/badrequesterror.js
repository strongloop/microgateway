// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt
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
