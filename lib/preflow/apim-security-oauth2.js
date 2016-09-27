// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';

var evalOauth2 = require('../oauth2/resource-server')({});

module.exports = {
  evalOauth2: evalOauth2 };

