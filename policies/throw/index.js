// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

module.exports = function(config) {

  return function(props, context, flow) {
    var error = {
      name: (props.name ? props.name + '' : 'ThrowError'),
      message: (props.message ? props.message + '' : undefined),
    };

    var logger = flow.logger;
    logger.error('[throw] throwing %j', error);
    flow.fail(error);
  };
};
