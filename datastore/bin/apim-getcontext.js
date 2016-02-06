#! /usr/bin/env node

var program = require('commander');
var apimlookup = require('../../server/middleware/preflow/apim-lookup');
var contextget = apimlookup.contextget;

var options = {};

program
  .usage('[options]')
  .option('-p, --path <path>', 'Path to find')
  .option('-m, --method <get|put|delete>', 'REST verb')
  .option('-c, --clientid <clientid>', 'clientid of request')
  .parse(process.argv);

options['path'] = program.path;
options['method'] = program.method;
options['clientid'] = program.clientid;


contextget(options,function(error, response) {
        console.log('context: ' + JSON.stringify(response,null,4));
});
