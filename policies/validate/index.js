// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var JsonRefs = require('json-refs');
var Validator = require('jsonschema').Validator;
var validator = new Validator();

module.exports = function(config) {
  return function(props, context, flow) {
    var logger = flow.logger;

    var def = props.definition;

    var hasError = false;
    if (def === 'request') {
//        post:
//            summary: ''
//            description: ''
//            parameters:
//            - schema:
//                $ref: "#/definitions/accountDetails"/
//              name: "input"
//              required: false
//              in: "body"


        logger.debug('Validation schema is from request property');

        var parameters = context._.api.parameters;
        parameters.forEach( function(parameter) {

            // there is only one parameter which "in" is "body" and this parameter can have "schema" property
            if (parameter.hasOwnProperty('schema') && parameter.in === 'body') {
                var schema = parameter.schema;
                var result = validator.validate(context.request.body, schema);
                if (!result.valid) {
                    logger.debug('Validation failed on request.parameters.%s: %j. Validation schema: %j',
                            parameter.name,
                            context.request.parameters[parameter.name],
                            schema);

                    var error = {
                            name: 'ValidateError',
                            message:
                                'Validation on request parameter ' + parameter.name + ' is failed.'
                        };
                    flow.fail(error);
                    hasError = true;
                }
            }
        });
    }
    else if (def === 'response') {
//        put:
//            responses:
//              200:
//                description: put 200 OK
//                schema:
//                  $ref: '#/definitions/Friend'
//              default:
//                description: Unexpected error
//                schema:
//                  $ref: '#/definitions/Person'


        logger.debug('Validation schema is from response property');

        var responses = context._.api.responses;
        var status = JSON.stringify(context.message.status.code);
        if (responses.hasOwnProperty(status) && responses[status].hasOwnProperty('schema')) {
            var schema = responses[status].schema;
            var result = validator.validate(context.message.body, schema);
            if (!result.valid) {
                logger.debug('Validation failed on response status %s: %j. Validation schema: %j',
                        status,
                        context.message.body,
                        schema);

                var error = {
                        name: 'ValidateError',
                        message:
                            'Validation on response ' + status + ' is failed.'
                    };
                flow.fail(error);
                hasError = true;
            }
        } else if (responses.hasOwnProperty('default') && responses['default'].hasOwnProperty('schema')) {
            var schema = responses.default.schema;
            var result = validator.validate(context.message.body, schema);
            if (!result.valid) {
                logger.debug('Validation failed on response status %s: %j. Default validation schema: %j',
                        status,
                        context.message.body,
                        schema);
                var error = {
                        name: 'ValidateError',
                        message:
                            'Validation on response with default schema is failed.'
                    };
                flow.fail(error);
                hasError = true;
            }
        } else {
            logger.debug('No validation is performed due to no validation schema found');
        }
    }
    else if (def){
//        - validate:
//            title: validate
//            definition: '#/definitions/Error'

        logger.debug('Validation schema is assigned directly');

        // since the returned definition will be a string, we need to do a trick here to 
        // get the JSON object that this JSON Pointer (the string) is refering 
        
        // get the whole swagger document and add the JSON Pointer with a JSON Reference
        var swg_doc = context.api.document;
        swg_doc.internal_def_schema = {schema: {"$ref" : def}};

        // resolve the JSON Reference on the modified swagger document
        JsonRefs.resolveRefs(swg_doc,{subDocPath: '#/internal_def_schema'}).then(function(res) {
            var schema = res.resolved.internal_def_schema.schema;
            var result = validator.validate(context.message.body, schema);
            if (!result.valid) {
                logger.debug('Validation failed message: %j. Assigned validation schema: %j',
                        context.message.body,
                        schema);
                var error = {
                        name: 'ValidateError',
                        message:
                            'Validation on request is failed.'
                    };
                flow.fail(error);
                hasError = true;
            }
        }, function (err) {
            logger.debug('Resolve validation schema failed: %s. No validation is performed.', err);
        });
    } else {
        logger.debug('No validation is performed due to invalid definition property');
        var error = {
                name: 'ValidateError',
                message:
                    'No validation schema definition is defined.'
            };
        flow.fail(error);
        hasError = true;
    }

  if (!hasError)
      flow.proceed();
  };
};
