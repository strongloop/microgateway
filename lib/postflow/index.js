/*
 * Populate the final response with the context.message
 */
'use strict';
var debug = require('debug')('micro-gateway:post');

module.exports = function createPostFlowMiddleware(options) {
    return function postflow(req, res, next) {
        debug("In the postflow, prepare the final response");
        try {
            var msg = req.ctx.get('message');
            if (msg) {
                res.writeHead(msg.statusCode, msg.statusMessage, msg.headers);
                if (msg.body)
                    res.write(msg.body);
                res.end();
            }
            next();
        }
        catch (error) {
            debug("Cannot read context.message in the postflow: " + error);
            next(error);
        }
    };
};

