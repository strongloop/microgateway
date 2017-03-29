// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

/*
 * Populate the final response with the context.message
 */
'use strict';
var qs = require('qs');
var _ = require('lodash');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:postflow' });

module.exports = function createPostFlowMiddleware(options) {
  return function postflow(req, res, next) {
    logger.debug('In the postflow, prepare the final response');

    req.ctx.notify('post-flow', function(errors) {
      try {
        var msg = req.ctx.get('message');

        if (msg.status) {
          res.statusCode = msg.status.code ? msg.status.code : 200;
          res.statusMessage = msg.status.reason;
        } else {
          res.statusCode = 200;
        }

        var contentType;
        var transferEncoding;
        if (msg.headers) {
          res.set(msg.headers);

          for (var hn in msg.headers) {
            var target = hn.toLowerCase();
            if (!contentType && target === 'content-type') {
              contentType = msg.headers[hn];
            }
            if (!transferEncoding && target === 'transfer-encoding') {
              transferEncoding = msg.headers[hn];
            }

            // early exit
            if (contentType && transferEncoding) {
              break;
            }
          }
        }

        var body = msg.body;
        if (body && !_.isString(body) && !_.isBuffer(body)) {
          if (contentType === 'application/x-www-form-urlencoded') {
            body = qs.stringify(body);
          } else {
            body = JSON.stringify(body);
          }
        }

        // Check if chunked mode is set
        if (transferEncoding !== 'chunked') {
          if (body) {
            res.set('Content-Length', Buffer.byteLength(body, 'utf8'));
          } else {
            res.set('Content-Length', 0);
          }
        }

        // Update X-Powered-By
        res.setHeader('X-Powered-By', 'IBM API Connect MicroGateway');

        if (body) {
          res.write(body);
        }

        res.end();
      } catch (error) {
        logger.debug('Cannot read context.message in the postflow: ' + error);
        next(error);
      }
    });
  };
};

