#! /usr/bin/env node


var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore:apim-export'});
var sgwapimpull = require('../apim-pull'),
    program = require('commander'),
    apimpull = sgwapimpull.pull;

var options = {};

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

if (options.host == null)  
{ logger.debug('<host> required'); program.outputHelp(); process.exit(1);}
if (program.args[1] != null) 
{ logger.debug('specify one host only'); program.outputHelp(); process.exit(1);}

apimpull(options,function(err, response) {
        if (err) {
            logger.error(err);
        }
        logger.debug(response);
});


