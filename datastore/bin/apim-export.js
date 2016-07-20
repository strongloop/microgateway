#! /usr/bin/env node
// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

var logger = require('apiconnect-cli-logger/logger.js')
         .child({ loc: 'microgateway:datastore:apim-export' });
var program = require('commander');

var sgwapimpull = require('../apim-pull');
var apimpull = sgwapimpull.pull;

var options = {};
var exit_flag = false;

program
  .version('0.0.1')
  .usage('[options] < host >')
  .option('-p, --port <number>', 'Port to connect to', parseInt)
  .option('-t, --timeout <number>', 'Connection timeout in seconds', parseInt)
  .option('-s, --srvca <name>', 'Server CA to use')
  .option('-k, --key <name>', 'Key to use')
  .option('-P, --pass <name>', 'Passphrase for key')
  .option('-c, --cert <name>', 'Cert to use')
  .option('-o, --outdir <path>', 'Directory for output')
  .parse(process.argv);


options.host = program.args[0];
options.port = program.port;
options.timeout = program.timeout;
options.srvca = program.srvca;
options.clikey = program.key;
options.clipass = program.pass;
options.clicert = program.cert;
options.outdir = program.outdir;

if (options.host == null) {
  exit_flag = true;
  logger.debug('<host> required');
  program.outputHelp();
  logger.exit(1);
}

if (!exit_flag && program.args[1] != null) {
  exit_flag = true;
  logger.debug('specify one host only');
  program.outputHelp();
  logger.exit(1);
}

if (!exit_flag) {
  apimpull(options, function(err, response) {
    if (err) {
      logger.error(err);
    } else {
      logger.debug(response);
    }
  });
}

