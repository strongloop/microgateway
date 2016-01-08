/*
 * Creates the APIm context object and populate context variables
 * with values from the req object
 */
'use strict';

//
// require third-party dependencies
//
var async = require('async');
var bodyParser = require('body-parser');
var debug = require('debug')('strong-gateway:context');
var extend = require('util')._extend;

//create body parser instances
var jsonBodyParser = bodyParser.json();
var rawBodyParser = bodyParser.raw();
var textBodyParser = bodyParser.text();
var urlencodedBodyParser = bodyParser.urlencoded({ extended: true });

//
// require internal dependencies
//
var createContext = require('flow-engine').createContext;


module.exports = function createContextMiddleware(options) {
  debug('configuration', options);

  options = extend(Object.create(null), options);

  return function(req, res, next) {
    // create the APIm context used for the following middlewares
    var ctx = createContext('apim');
    req.ctx = ctx;

    ctx.req = req;
    ctx.res = res;

    populateRequestVariables(ctx, req);
    populateSystemVariables(ctx);
    populateMessageVariables(ctx, req, function(error) {
      next();
    });
  };
};

/**
 * Populates APIm context variables in the Request category, including
 *  - request.verb
 *  - request.uri
 *  - request.path
 *  - request.headers.{name}: all header variable names will be in lower case
 *    (e.g. request.headers.authorization
 *  - request.content-type: normalized, may not be the same as request.
 *    headers.content-type
 *  - request.date
 *  - request.authorization
 * 
 * @param ctx the APIm context object
 * @param req the request object from the wire
 * 
 */
function populateRequestVariables(ctx, req) {
  
  ctx.set('request.verb', req.method); // TODO: lower case? upper case?
  
  //TODO confirm is it the full original URL before modification by apim/express
  ctx.set('request.uri', req.originalUrl);
  
  ctx.set('request.path', req.path);  // TODO includes org/catalog/basepath?
  
  // TODO when getting content-type header, should user do 
  // ctx.get('request.headers')['content-type'] ? 
  // or ctx.get('request.headers["content-type"]) ?
  ctx.set('request.headers', req.headers);
  
  //TODO what's the required normalization?  
  //     What if the req doesn't contain content-type?
  ctx.set('request.content-type', req.get('content-type')); 
  
  //TODO what if the req header doesn't contain 'date'? data type: string? 
  // Date object?
  ctx.set('request.date', req.get('date'));
  
  //TODO what if the req header doesn't contain 'authorization'?
  ctx.set('request.authorization', req.get('authorization'));  

}

/**
 * Populates APIm context variables in the System category, including
 *  - system.datetime
 *  - system.time
 *  - system.time.hour
 *  - system.time.minute
 *  - system.time.seconds
 *  - system.date
 *  - system.date.dayOfWeek
 *  - system.date.dayOfMonth
 *  - system.date.month
 *  - system.date.year
 *  - system.timezone
 * 
 * @param ctx the APIm context object
 * 
 */
function populateSystemVariables(ctx) {
  // TODO implement this
  // system variables are not priority ones.. leave a placeholder here
}


/**
 * Populates APIm context variables in the Message category, including
 *  - message.headers.{headername}
 *  - message.body
 * 
 * @param ctx the APIm context object
 * @param req the request object from the wire
 * 
 */
function populateMessageVariables(ctx, req, callback) {
  
  ctx.set('message.headers', req.headers);

  // TODO use body-parser for now, in the future, lazy reading?
  if (req.body) {
    ctx.set('message.body', req.body);
    process.nextTick(callback);
  } else {
    /*
     * TODO - we should probably defer the message variables population till,
     *        swagger metadata is annotated.
     *        with that, we know the content-type and we know what data type
     *        to be put into message.body.
     *        we probably should also make message.body as a getter to
     *        do lazy read
     */
    async.series([
        function(callback) {
          jsonBodyParser(req, {}, callback);
        },
        function(callback) {
          rawBodyParser(req, {}, callback);
        },
        function(callback) {
          textBodyParser(req, {}, callback);
        },
        function(callback) {
          urlencodedBodyParser(req, {}, callback);
        }
      ], function(err, results) {
        process.nextTick(callback, err);
      });
  }
  
}

