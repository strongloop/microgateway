// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';
var moment = require('moment');
var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:policies:rate-limiting:get-interval' });
var assert = require('assert');

module.exports = function getInterval(limit, period, unit, unparsed) {
  if (typeof unparsed === 'string') {
    /*
     * The value can be one of the following formats
     * 100 ==> 100/1hour
     * 100/1 ==> 100/1hour
     * 100/1/hour ==> 100/1hour
     * Spaces are ignored
     */
    var parts;
    if (unparsed.toUpperCase() === 'UNLIMITED') {
      parts = [ unparsed, Number.MAX_SAFE_INTEGER / 1000, 1, 'seconds' ];
    } else {
      var pattern = /^([\d\s]+)(?:\/([\d\s]*)([a-zA-Z\s]*))?$/;
      parts = pattern.exec(unparsed);
    }
    assert(parts, 'Rate limit value is invalid: ' + unparsed);
    limit = Number(parts[1]) || limit;
    period = Number(parts[2]) || period;
    unit = (parts[3] || unit).trim();
  }

  // moment.duration does not like 'min' as a unit of measure, convert to 'm'
  // See http://momentjs.com/docs/#/durations/creating/
  switch (unit) {
    case 'min':
    case 'mins':
    case 'minute':
    case 'minutes':
      unit = 'm';
      break;
    case 'sec':
    case 'secs':
    case 'second':
    case 'seconds':
      unit = 's';
      break;
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      unit = 'h';
      break;
    case 'day':
    case 'days':
      unit = 'd';
      break;
    case 'wk':
    case 'wks':
    case 'week':
    case 'weeks':
      unit = 'w';
      break;
    default:
      logger.error('Invalid unit for limit: %d/%d%s defaulting to hours',
                   limit, period, unit);
      unit = 'h';
      break;
  }

  logger.debug('Limit: %d/%d%s', limit, period, unit);
  var interval = moment.duration(period, unit).asMilliseconds();
  return { limit: limit, interval: interval };
};
