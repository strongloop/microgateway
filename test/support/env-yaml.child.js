// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';

require('../../');
setTimeout(function() {
  process.send(process.env);
}, 5000);
