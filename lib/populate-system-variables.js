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
var debug = require('debug')('strong-gateway:context:system-var');
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
  debug('configuration', options);

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
    ctx.define('system.date.dayOfWeek', getDateDayOfWeek, false);
    ctx.define('system.date.dayOfMonth', getDateDayOfMonth, false);
    ctx.define('system.date.month', getDateMonth, false);
    ctx.define('system.date.year', getDateYear, false);
    ctx.define('system.timezone', getTimezone, false);
  };

  function getDateTime() {
    debug('getDateTime()');
    return moment.utc().format(options.datetimeFormat);
  }

  function getTimeHour() {
    debug('getTimeHour()');
    return (new Date()).getHours();
  }

  function getTimeMinute() {
    debug('getTimeMinute()');
    return (new Date()).getMinutes();
  }

  function getTimeSeconds() {
    debug('getTimeSeconds()');
    return (new Date()).getSeconds();
  }

  function getDateDayOfWeek() {
    debug('getDateDayOfWeek()');
    return (new Date()).getDay();
  }

  function getDateDayOfMonth() {
    debug('getDateDayOfMonth()');
    return (new Date()).getDate();
  }

  function getDateMonth() {
    debug('getDateMonth()');
    return (new Date()).getMonth();
  }

  function getDateYear() {
    debug('getDateYear()');
    return (new Date()).getFullYear();
  }

  function getTimezone() {
    debug('getTimezone()');
    return moment().format(options.timezoneFormat);
  }
};
