'use strict';
var logger = require('../../../apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:policies:invoke'});
var fs = require('fs');
var url = require('url');
var assert = require('assert');
var zlib = require('zlib');
var dsc = require('../../datastore/client');

//TODO: move this file to lib/ or util/?
//one-time effort: read the cipher table into memory
var cipherTable;
try {
    //the mapping table of TLS to OpenSSL ciphersuites
    cipherTable = require(__dirname + '/cipherSuites.json');
}
catch (err) {
    logger.error('Warning! Cannot read the cipher table for invoke policy. %s',
            err);
    cipherTable = {};
}


/**
 * Do the real work of the invoke policy: read the property and decide the
 * parameters, establish the connection after everything is ready.
 */
function _main(props, context, next, tlsProfile) {
    //var logger = context.get('logger');

    //the default settings and error object
    var options;
    var isSecured;
    var verb;
    var useChunk = false;
    var timeout = 60;
    var compression = false;
    var error = { name: 'property error' };
    var data, dataSz = 0;

    //TODO: support the input and output property
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
        if (options.protocol === 'https:') {
            if (!tlsProfile)
                logger.warn('[invoke] no TLS profile for a HTTPS connection');
            isSecured = true;
        }
    }
    logger.info('[invoke] url: %s', options.href);

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
    logger.debug('[invoke] verb: %s', verb);

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
    logger.debug('[invoke] useChunk: %s', useChunk);

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
    logger.debug('[invoke] timeout: %s seconds', timeout);

    //compression
    if (props.compression === true || props.compression === 'true')
        compression = true;
    logger.debug('[invoke] compression: %s', compression);

    //authentication
    if (props.username && props.password)
        options.auth = props.username + ':' + props.password;
    logger.debug('[invoke] auth: %s', options.auth, {});

    //TODO: do we need the context.message.rawHeaders?
    //copy headers
    options.headers = {};
    for (var i in context.message.headers)
        options.headers[i] = context.message.headers[i];
    delete options.headers.host;
    delete options.headers.connection;
    delete options.headers['content-length'];
    delete options.headers['content-encoding'];
    delete options.headers['transfer-encoding'];

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

    //Compress the data or not
    if (compression)
        options.headers['Content-Encoding'] = 'gzip';

    //when compression is true, we can only use chunks
    if (!compression && !useChunk) {
        options.headers['Content-Length'] = dataSz;
        logger.debug('[invoke] content-length = %d', dataSz);
    }

    logger.debug('[invoke] w/ headers: %j', options.headers, {});

    //setup the HTTPs settings
    var http = isSecured ? require('https') : require('http');
    if (isSecured && tlsProfile) {
        options.agent = false;
        //key
        options.key = tlsProfile['private-key'];

        //cert
        for (var c in tlsProfile.certs) {
            if (tlsProfile.certs[c]['cert-type'] === 'CLIENT') {
                options.cert = tlsProfile.certs[c].cert;
                break;
            }
        }

        //ca list
        options.ca = [];
        for (var p in tlsProfile.certs) {
            if (tlsProfile.certs[p]['cert-type'] === 'PUBLIC') {
                logger.debug('[invoke] uses the ca: %s',
                        tlsProfile.certs[p].name);
                options.ca = tlsProfile.certs[p].cert;
            }
        }

        if (options.ca.length > 0 || tlsProfile['mutual-auth'])
            options.rejectUnauthorized = true;

        //secureProtocol
        if (tlsProfile.protocols && Array.isArray(tlsProfile.protocols)) {
            for (var j=0; j<tlsProfile.protocols.length; j++) {
                switch (tlsProfile.protocols[j]) {
                  case 'TLSv1':
                    options.secureProtocol = 'TLSv1_method';
                    break;
                  case 'TLSv11':
                    options.secureProtocol = 'TLSv1_1_method';
                    break;
                  case 'TLSv12':
                    options.secureProtocol = 'TLSv1_2_method';
                    break;
                  default:
                    logger.warn('[invoke] unsupported secure protocol: %s',
                            tlsProfile.protocols[j]);
                    break;
                }
                break;
            }
        }

        //ciphers
        var ciphers = [];
        if (tlsProfile.ciphers && Array.isArray(tlsProfile.ciphers)) {
            options.honorCipherOrder = true;
            for (var k=0; k<tlsProfile.ciphers.length; k++) {
                var cipher = cipherTable[tlsProfile.ciphers[k]];
                if (cipher)
                    ciphers.push(cipher);
                else
                    logger.warn("[invoke] unknown cipher: %s",
                            tlsProfile.ciphers[k]);
            }
            options.ciphers = ciphers.join(':');
        }
    }

    //write the request
    var request;
    try {
        request = http.request(options, function(response) {
            //read the response
            var target = context.message;

            //TODO: rename the reasonPhrase
            target.statusCode = response.statusCode;
            target.reasonPhrase = response.reasonPhrase;
            logger.info('[invoke] response is received: %d, %s',
                target.statusCode, target.reasonPhrase);

            target.headers = {};
            var rhrs = response.rawHeaders;
            for (var i = 0; i < rhrs.length; i+=2) {
                target.headers[rhrs[i]] = rhrs[i+1];
            }

            target.body = [];
            response.on('data', function(chunk) {
                target.body += chunk;
            });

            //TODO: convert the target.body to JSON
            response.on('end', function() {
                logger.info('[invoke] done');
                next();
            });
        });
    }
    catch (err) {
        error.name = 'connection error';
        error.value = err.toString();
        error.message = err.toString();

        next(error);
        return;
    }

    //setup the timeout callback
    request.setTimeout(timeout * 1000, function() {
        logger.error('[invoke] The invoke policy is timeouted.');

        error.name = 'connection error';
        error.value = 'Invoke policy timeout';
        error.message = error.value;

        next(error);
        request.abort();
    });

    //setup the error callback
    request.on('error', function(err) {
        logger.error('[invoke] request failed: %s', err);

        error.name = 'connection error';
        error.value = err.toString();
        error.message = err.toString();

        next(error);
    });

    if (compression) {
        zlib.gzip(data, function(err, buffer) {
            if (err) {
                logger.error("[invoke] cannot compress the data");

                next(err);
                request.abort();
            }
            else {
                request.write(buffer);
                request.end();
            }
        });
    }
    else {
        request.write(data);
        request.end();
    }
}

/**
 * The entry point of the invoke policy.
 * Read the TLS profile first and do the real work then.
 */
function invoke(props, context, next) {
    var logger = context.get('logger');

    var isDone = false;
    function _next(v) {
        if (!isDone) {
            isDone = true;
            next(v);
        }
    }

    if (!props || typeof props !== 'object') {
        var error = {
            name: 'property error',
            value: 'Invalid property object',
            message: 'Invalid property object'
        };
        _next(error);
        return;
    }

    var snapshotId = context.get('config-snapshot-id');
    var profile = props['tls-profile'];
    var tlsProfile;
    if (!profile || typeof profile !== 'string' || profile.length === 0) {
        _main(props, context, _next);
    }
    else {
        logger.debug('[invoke] reading the TLS profile "%s"', profile);

        dsc.getTlsProfile(snapshotId, profile).then(
            function(result) {
                if (result !== undefined && Array.isArray(result) && result.length > 0)
                    tlsProfile = result[0];

                if (!tlsProfile) {
                    logger.error('[invoke] cannot find the TLS profile "%s"', profile);
                    var error = {
                        name: 'property error',
                        value: 'Cannot find the TLS profile object',
                        message: 'Cannot find the TLS profile "' + profile + '"',
                    };

                    _next(error);
                    return;
                }
                else
                    _main(props, context, _next, tlsProfile);
            },
            function(e) {
                logger.error('[invoke] error w/ retrieving TLS profile: %s', e);

                var error = {
                    name: 'property error',
                    value: e.toString(),
                    message: e.toString(),
                };
                _next(error);
            });
    }
}

module.exports = function(config) {
    return invoke;
};
