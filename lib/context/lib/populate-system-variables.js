// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

/**
 * Populates APIm context variables in the System category, including
 *  - system.datetime
 *  - system.time
 *  - system.time.hour
 *  - system.time.minute
 *  - system.time.seconds
 *  - system.date
 *  - system.date.day-of-week
 *  - system.date.day-of-month
 *  - system.date.month
 *  - system.date.year
 *  - system.timezone
 */
'use strict';

//
// third-party module dependencies
//
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:context:populate-system-variables' });
var moment = require('moment');


/**
 * Returns a function that can populate the variables in the
 * System category.
 *
 * @param {Object} options
 *    - datetimeFormat: the `moment` module format string
 *    - timeFormat: the `moment` module format string
 *    - dateFormat: the `moment` module format string
 *    - timezoneFormat: the `moment` module format string
 *    When not provided, date/time string is in ISO 8601
 *    style.
 *
 */
module.exports = function populateSystemVariables(options) {
  logger.debug('configuration', options);

  options = options || {};

  // defines/defaults the datetime, date, and time format
  options.datetimeFormat = options.datetimeFormat ||
                           'YYYY-MM-DDTHH:mm:ssZ';
  options.timezoneFormat = options.timezoneFormat ||
                           'Z';

/**
 * Populates APIm context variables in the System category
 *
 * @param ctx the APIm context object
 *
 */
  return function(ctx) {
    // TODO implement this
    // system variables are not priority ones.. leave a placeholder here
    ctx.define('system.datetime', getDateTime, false);
    // ctx.define('system.time', getTime, false);
    ctx.define('system.time.hour', getTimeHour, false);
    ctx.define('system.time.minute', getTimeMinute, false);
    ctx.define('system.time.seconds', getTimeSeconds, false);
    // ctx.define('system.date', getDate, false);
    ctx.define('system.date.day-of-week', getDateDayOfWeek, false);
    ctx.define('system.date.day-of-month', getDateDayOfMonth, false);
    ctx.define('system.date.month', getDateMonth, false);
    ctx.define('system.date.year', getDateYear, false);
    ctx.define('system.timezone', getTimezone, false);

    //freeze properties under 'system' and also set 'system' to read-only
    Object.freeze(ctx.system);
    ctx.set('system', ctx.system, true);
  };

  function getDateTime() {
    logger.debug('getDateTime()');
    return moment.utc().format(options.datetimeFormat);
  }

  function getTimeHour() {
    logger.debug('getTimeHour()');
    return (new Date()).getHours();
  }

  function getTimeMinute() {
    logger.debug('getTimeMinute()');
    return (new Date()).getMinutes();
  }

  function getTimeSeconds() {
    logger.debug('getTimeSeconds()');
    return (new Date()).getSeconds();
  }

  function getDateDayOfWeek() {
    logger.debug('getDateDayOfWeek()');
    return (new Date()).getDay();
  }

  function getDateDayOfMonth() {
    logger.debug('getDateDayOfMonth()');
    return (new Date()).getDate();
  }

  function getDateMonth() {
    logger.debug('getDateMonth()');
    return (new Date()).getMonth();
  }

  function getDateYear() {
    logger.debug('getDateYear()');
    return (new Date()).getFullYear();
  }

  function getTimezone() {
    logger.debug('getTimezone()');
    return moment().format(options.timezoneFormat);
  }
};
