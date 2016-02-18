'use strict';
var debug = require('debug')('policy:invoke');
var url = require('url');
var assert = require('assert');

/*
// TODO: This is only a sample.
// getTlsProfile returns a promise that can be used to get the TLS Profile
// information, but this instance is hardcoded to get one from the mock
// datastore. This code can't be tested until Tony adds code to flow-engine to
// resolve policy at this location (micro-gw/policy)

var dsc = require('../datastore/client');
dsc.getTlsProfile(context.get('config-snapshot-id'), 'new-tls-profile-1')
    .then(function(result) {console.log('TLS: ' + JSON.stringify(result));},
          function(error) {console.log('TLS ERR: ' + error);});

console.log("NEWPOLICY LOC- SnapshotID: " + context.get('config-snapshot-id'));
*/

// TODO: handle self signed certificates
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';


function invoke(props, context, next) {
    //the default settings and error object
    var options;
    var isSecured;
    var verb;
    var useChunk = false;
    var timeout = 60;
    var compression = false;
    var error = { name: 'property error' };
    var data, dataSz = 0;

    var logger = context.get('logger');

    if (!props || typeof props !== 'object') {
        error.value = 'Invalid property object';
        error.message = error.value;
        next(error);
        return;
    }

    //TODO: check context.request and context.message
    assert(context.request && context.message);

    if (typeof props['target-url'] === 'string')
        options = url.parse(props['target-url']);

    //target-url
    if (!options || !options.hostname || !options.protocol ||
            (options.protocol !== 'http:' && options.protocol !== 'https:')) {
        error.value = 'Invalid target-url: "' + props['target-url']  + '"';
        error.message = error.value;
        next(error);
        return;
    }
    else {
        if (options.protocol === 'https:')
            isSecured = true;
    }
    logger.debug("invoke options: %j", options, {});

    //verb: default to request.verb
    verb = props.verb ? String(props.verb).toUpperCase() : context.request.verb;
    if (verb !== 'POST' && verb !== 'GET' && verb !== 'PUT' &&
        verb !== 'DELETE' && verb !== 'OPTIONS' && verb !== 'HEAD' &&
        verb !== 'PATCH') {
        error.value = 'Invalid verb: "' + props.verb + '"';
        error.message = error.value;
        next(error);
        return;
    }
    else
        options.method = verb;
    logger.debug("invoke verb: %s", verb);

    //http-version: 1.1
    if (props['http-version'] && props['http-version'] !== '1.1') {
        error.value = 'Invalid http-version: "' + props['http-version'] + '"';
        error.message = error.value;
        next(error);
        return;
    }

    //chunked-upload
    if (props['chunked-upload'] && props['chunked-upload'] !== 'false')
        useChunk = true;
    logger.debug("invoke useChunk: %s", useChunk);

    //timeout: between 1 to 86400 seconds
    if (!isNaN(parseInt(props.timeout))) {
        var tmp = parseInt(props.timeout);
        if (tmp < 1)
            timeout = 1;
        else if (tmp > 86400)
            timeout = 86400;
        else
            timeout = tmp;
    }
    logger.debug("invoke timeout: %s", timeout);

    //compression
    if (props.compresssion && props.compresssion !== 'false')
        compression = true;
    logger.debug("invoke compression: %s", compression);

    //authentication
    if (props.username && props.password)
        options.auth = props.username + ':' + props.password;
    logger.debug("invoke auth: %s", options.auth, {});

    //TODO: get the TLS profile

    //copy headers
    options.headers = {};
    for (var i in context.message.headers)
        options.headers[i] = context.message.headers[i];
    delete options.headers['host'];
    delete options.headers['connection'];
    delete options.headers['content-length'];

    //TODO: compress with zlib
    //prepare the data and dataSz
    data = context.message.body;
    assert(data);
    if (!Buffer.isBuffer(data) && typeof data !== 'string') {
        if (typeof data === 'object')
            data = JSON.stringify(data);
        else
            data = String(data);
    }
    dataSz = data.length;

    if (!useChunk)
        options.headers['content-length'] = dataSz;

    logger.info('invoke w/ headers: %j', options.headers, {});

    //write the request
    var http = isSecured ? require('https') : require('http');

    var request = http.request(options, function(response) {
        //read the response
        var target = context.message;
        target.headers = {};

        target.statusCode = response.statusCode;
        target.statusMessage = response.statusMessage;

        for (var i in response.headers)
            target.headers[i] = response.headers[i];

        target.body = '';

        logger.info('invoke response: %d, %s', target.statusCode, target.statusMessage);
        logger.info('invoke response headers: %j', target.headers, {});
        response.on('data', function(chunk) {
            logger.debug('invoke is reading: %s', chunk);
            target.body += chunk;
        });

        response.on('end', function() {
            if (typeof target.write === 'function') {
                target.write(target.body);
            }

            if (typeof target.end === 'function') {
                target.end();
            }

            logger.debug('invoke target.body: %s', target.body);
            logger.debug('invoke context.message: %j', context.message, {});
            logger.info('invoke done');
            next();
        });
    });

    //setup the timeout callback
    request.setTimeout(timeout * 1000, function() {
        logger.error('invoke policy timeouted');

        error.name = 'connection error';
        error.value = 'Invoke policy timeout';

        next(error);
        request.abort();
    });
    logger.debug('Timeout is set to %d seconds.', timeout);

    //setup the error callback
    request.on('error', function(e) {
        logger.error('invoke policy failed: %s', e);

        error.name = 'connection error';
        error.value = e.toString();

        next(error);
    });

    logger.debug('invoke request: %s', data);
    request.write(data);
    request.end();
};

module.exports = function(config) {
    return invoke;
};
