var createFlow = require('flow-engine');
var express = require('express');

var flow = createFlow({
  flow: 'flow.yaml',
  tasks: {'activity-log': './myactivity-log.js'},
  baseDir: __dirname});

var app = express();
app.post('/*', [flow]);
