var fs = require('fs');
var async = require('async');
var debug = require('debug')('micro-gateway:utils');
var configFileName = 'apim.config';
var rootConfigPath = '/../config/';
var configFile = __dirname + rootConfigPath + configFileName;
var APIMANAGER='APIMANAGER';
var APIMANAGER_PORT='APIMANAGER_PORT';
var CONFIGDIR='CONFIG_DIR';
var DATASTORE_PORT='DATASTORE_PORT';
var PORT='PORT';
var HTTPS_PORT='HTTPS_PORT';
var LOADED='LOADED';

function setConfigFileVariable(variable, value)
	{
	testVar(variable);
	var configInfo;
	try {
		configInfo = JSON.parse(fs.readFileSync(configFile));
		// write them to a file
		configInfo[variable] = value;
        fs.writeFileSync(configFile, JSON.stringify(configInfo,null,4));
		} 
	catch (e) {
		console.error(e);
		}   
	}

function getVariable(variable, fncallback, endcallback)
	{
	var value=null;
	testVar(variable);
	debug('Looking for variable: ', variable);
	async.series([
        function(callback) {
				// check env vars... 
				if (process.env[variable])
					{
					debug('ENV variable found: %s = %s', variable, value);
					value=process.env[variable];
					}
				debug('getVariable ENV end: ', value);
                callback();
                },
        function(callback) {
				// check config file... env var wins
				if (!value)
					{
					fs.access(configFile, fs.R_OK, function (err) 
						{
						if (err) {
							debug('apim.config not found %s', configFile);
							}
						else {
							debug('Found and have access to %s', configFile);
							var config;
							try {
								config = JSON.parse(fs.readFileSync(configFile));
								value=config[variable];
								} 
							catch (e) {
								console.error(e);
								}        
							}
							debug('getVariable access end: ', value);
							callback();
						});
					}
				else {callback();}
                }],
		function(err) {
				debug('getVariable returning  %s', value);
				fncallback(value);
				endcallback();
				});

	}
	
function testVar(variable)
	{
	switch(variable) {
		case APIMANAGER:
		case APIMANAGER_PORT:
		case CONFIGDIR:
		case DATASTORE_PORT:
		case PORT:
		case HTTPS_PORT:
			break;
		default:
			console.log('define your variable:' + variable + ' in environment.js');
		}
	}
	

exports.getVariable = getVariable;
exports.setConfigFileVariable = setConfigFileVariable;
exports.APIMANAGER = APIMANAGER;
exports.APIMANAGER_PORT = APIMANAGER_PORT;
exports.CONFIGDIR = CONFIGDIR;
exports.DATASTORE_PORT = DATASTORE_PORT;
exports.PORT = PORT;
exports.HTTPS_PORT = HTTPS_PORT;
exports.LOADED = LOADED;