// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var _ = require('lodash');
var fs = require('fs');
var url = require('url');
var qs = require('qs');
var zlib = require('zlib');
var dsc = require('../../datastore/client');

//one-time effort: read the cipher table into memory
var cipherTable;
try {
    //the mapping table of TLS to OpenSSL ciphersuites
    cipherTable = require(__dirname + '/../../lib/cipher-suites.json');
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
function _main(props, context, next, logger, tlsProfile) {
    //the default settings and error object
    var readSrc, writeDst;
    var options;
    var isSecured;
    var verb;
    var useChunk = false;
    var timeout = 60;
    var compression = false;
    var error = { name: 'PropertyError' };
    var data, dataSz = 0;

    if (typeof props['target-url'] === 'string')
        options = url.parse(props['target-url']);

    //target-url
    if (!options || !options.hostname || !options.protocol ||
            (options.protocol !== 'http:' && options.protocol !== 'https:')) {
        error.message = 'Invalid target-url: "' + props['target-url']  + '"';
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
    verb = props.verb ? String(props.verb).toUpperCase() :
            (context.request ? context.request.verb.toUpperCase() : undefined);
    if (verb !== 'POST' && verb !== 'GET' && verb !== 'PUT' &&
        verb !== 'DELETE' && verb !== 'OPTIONS' && verb !== 'HEAD' &&
        verb !== 'PATCH') {
        error.message = 'Invalid verb: "' + props.verb + '"';
        next(error);
        return;
    }
    else
        options.method = verb;
    logger.debug('[invoke] verb: %s', verb);

    //http-version: 1.1
    if (props['http-version'] && props['http-version'] !== '1.1') {
        error.message = 'Invalid http-version: "' + props['http-version'] + '"';
        next(error);
        return;
    }

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

    //authentication
    if (props.username && props.password)
        options.auth = props.username + ':' + props.password;
    logger.debug('[invoke] auth: %s', options.auth, {});

    //readSrc: decide where to read the data
    if (props.input) {
        if (typeof props.input === 'string') {
            var theIn = context.get(props.input);
            if (typeof theIn === 'object') {
                logger.info('[invoke] will read data and headers from "%s"',
                        props.input);
                readSrc = theIn;
            }
        }

        if (!readSrc) {
            logger.error('Cannot read data or headers from the input ' + 
                    'property "%s"', props.input);
            error.message = 'Invalid input: "' + props.input + '"';
            next(error);
            return;
        }
    }
    else
        readSrc = context.message;

    //writeDst: decide where to write the response
    if (props.output) {
        if (typeof props.output === 'string') {
            logger.info('[invoke] the output destination will be set to %s',
                    props.output);

            var theOut = {};
            context.set(props.output, theOut);
            writeDst = theOut;
        }

        if (!writeDst) {
            logger.error('The output property "%s" is not a valid javascript ' +
                    'identifier.', props.output);
            error.message = 'Invalid output: "' + props.output + '"';
            next(error);
            return;
        }
    }
    else {
        if (context.message === undefined)
            //In fact, this should never happen
            context.message = {};

        writeDst = context.message;
    }

    //clone the readSrc.headers, because some headers need to be excluded
    options.headers = _.clone(readSrc.headers);

    //The headers that should not be copied
    var excludes = ['host','connection','content-length','transfer-encoding'];

    //test if the content-type is urlencoded
    var isFormUrlEncoded;

    for (var hn in options.headers) {
        var target = hn.toLowerCase();
        if (target === 'content-type' &&
                options.headers[hn] === 'application/x-www-form-urlencoded')
            isFormUrlEncoded = true;

        var index = excludes.indexOf(target);
        if (index >= 0) {
            // remove the header that shouldn't be sent
            delete options.headers[hn];
            // remove the header already processed
            excludes.splice(index, 1);
        }

        //early exit
        if (excludes.length === 0 && isFormUrlEncoded)
            break;
    }

    //prepare the data and dataSz
    data = (readSrc.body === undefined ? '' : readSrc.body);
    if (!Buffer.isBuffer(data) && typeof data !== 'string') {
        if (typeof data === 'object') {
            if (isFormUrlEncoded)
                data = qs.stringify(data);
            else
                data = JSON.stringify(data);
        }
        else
            data = String(data);
    }
    dataSz = data.length;

    //chunked-upload
    if (props['chunked-upload'] && props['chunked-upload'] !== 'false')
        useChunk = true;
    logger.debug('[invoke] useChunk: %s', useChunk);

    //compression
    if (props.compression === true || props.compression === 'true')
        compression = true;
    logger.debug('[invoke] compression: %s', compression);

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
    if (isSecured) {
      options.agent = false; // do we really want to set this?  no conn pooling
      options.rejectUnauthorized = false;
      if (tlsProfile) {
        //key
        options.key = tlsProfile['private-key'];

        //cert
        for (var c in tlsProfile.certs) {
            if (tlsProfile.certs[c]['cert-type'] === 'PUBLIC') {
                options.cert = tlsProfile.certs[c].cert;
                break;
            }
        }

        //ca list
        options.ca = [];
        for (var p in tlsProfile.certs) {
            if (tlsProfile.certs[p]['cert-type'] === 'CLIENT') {
                logger.debug('[invoke] uses the ca.name: %s',
                        tlsProfile.certs[p].name);
                options.ca.push(tlsProfile.certs[p].cert);

            }
        }

        if (options.ca.length > 0 || tlsProfile['mutual-auth']) {
            options.rejectUnauthorized = true;
            logger.debug('[invoke] rejectUnauthorized = true');
        }
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
                if (options.secureProtocol)
                  break;
            }
        }

        //ciphers
        var ciphers = [];
        if (tlsProfile.ciphers && Array.isArray(tlsProfile.ciphers)) {
            options.honorCipherOrder = true;
            for (var k=0; k<tlsProfile.ciphers.length; k++) {
                var cipher = cipherTable[tlsProfile.ciphers[k]];
                if (cipher) {
                    logger.debug("[invoke] using cipher: %s", cipher);
                    ciphers.push(cipher);
                }
                else
                    logger.warn("[invoke] unknown cipher: %s",
                            tlsProfile.ciphers[k]);
            }
            options.ciphers = ciphers.join(':');
        }
      }
    }

    //write the request
    var request;
    try {
        request = http.request(options, function(response) {
            //read the response
            writeDst.status = {
                code: response.statusCode,
                reason: response.reasonPhrase
            };
            logger.info('[invoke] response is received: %d, %s',
                writeDst.status.code, writeDst.status.reason);
            writeDst.headers = {};

            //note: there is no response.rawHeaders for node v0.10.43
            var rhrs = response.rawHeaders || response.headers;
            for (var i = 0; i < rhrs.length; i+=2) {
                writeDst.headers[rhrs[i]] = rhrs[i+1];
            }

            var chunks = [];
            response.on('data', function(data) {
                chunks.push(data);
            });

            response.on('end', function() {
                logger.info('[invoke] done');

                //Decide whether the body should be a Buffer or JSON object.
                //If the content-type says it is a JSON object, try to parse it.
                var tmp = Buffer.concat(chunks);
                var cEncode = response.headers['content-encoding']; //ex: gzip
                var cType = response.headers['content-type'];

                if (!cEncode) {
                    if (cType === 'application/x-www-form-urlencoded') {
                        tmp = qs.parse(tmp.toString());
                    }
                    else if (cType &&
                        cType.toLowerCase().indexOf('json') !== -1) {
                        try {
                            tmp = JSON.parse(tmp);
                        }
                        catch(e) {
                            logger.warn('Failed parse the body (%s) as JSON: %s. ' +
                                'Leave it as a Buffer object', cType, e);
                        }
                    }
                }
                writeDst.body = tmp;

                //Let Express itself to decide the final transfer-encoding
                var discard = [ 'transfer-encoding' ];
                for (var m in discard) {
                    var tbd = discard[m];
                    for (var n in writeDst.headers) {
                        if (n.toLowerCase() === tbd) {
                            delete writeDst.headers[n];
                            break;
                        }
                    }
                }
                next();
            });
        });
    }
    catch (err) {
        error.name = 'ConnectionError';
        error.message = err.toString();

        next(error);
        return;
    }

    //setup the timeout callback
    request.setTimeout(timeout * 1000, function() {
        logger.error('[invoke] The invoke policy is timeouted.');

        error.name = 'ConnectionError';
        error.message = 'The invoke policy is timeouted.';

        next(error);
        request.abort();
    });

    //setup the error callback
    request.on('error', function(err) {
        logger.error('[invoke] request failed: %s', err);

        error.name = 'ConnectionError';
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
function invoke(props, context, flow) {
    var logger = flow.logger;

    var isDone = false;
    function _next(v) {
        if (!isDone) {
            isDone = true;
            if(v) {
                flow.fail(v);
            } else {
                flow.proceed();
            }
        }
    }

    if (!props || typeof props !== 'object') {
        var error = {
            name: 'PropertyError',
            message: 'Invalid property object'
        };
        _next(error);
        return;
    }

    var snapshotId = context.get('config-snapshot-id');
    var profile = props['tls-profile'];
    var tlsProfile;
    if (!profile || typeof profile !== 'string' || profile.length === 0) {
        _main(props, context, _next, logger);
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
                        name: 'PropertyError',
                        message: 'Cannot find the TLS profile "' + profile + '"',
                    };

                    _next(error);
                    return;
                }
                else
                    _main(props, context, _next, logger, tlsProfile);
            },
            function(e) {
                logger.error('[invoke] error w/ retrieving TLS profile: %s', e);

                var error = {
                    name: 'PropertyError',
                    message: e.toString(),
                };
                _next(error);
            });
    }
}

module.exports = function(config) {
    return invoke;
};
