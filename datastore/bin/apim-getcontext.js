#! /usr/bin/env node
// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:datastore:apim-getcontext' });
var program = require('commander');
var apimlookup = require('../../lib/preflow/apim-lookup');
var contextget = apimlookup.contextget;

var options = {};

program
  .usage('[options]')
  .option('-p, --path <path>', 'Path to find')
  .option('-m, --method <get|put|delete>', 'REST verb')
  .option('-c, --clientid <clientid>', 'clientid of request')
  .parse(process.argv);

options.path = program.path;
options.method = program.method;
options.clientid = program.clientid;

contextget(options, function(error, response) {
  if (logger.debug()) {
    logger.debug('context: %s', JSON.stringify(response, null, 4));
  }
});
