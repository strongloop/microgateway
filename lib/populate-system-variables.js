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
 */
'use strict';

//
// third-party module dependencies
//
var debug = require('debug')('strong-gateway:context');


/**
 * Populates APIm context variables in the System category
 *
 * @param ctx the APIm context object
 *
 */
module.exports = function populateSystemVariables(options) {
  debug('configuration', options);

  options = options || {};

  return function(ctx) {
    // TODO implement this
    // system variables are not priority ones.. leave a placeholder here
  };
};



