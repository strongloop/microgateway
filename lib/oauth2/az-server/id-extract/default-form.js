// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
'use strict';


module.exports = function (config) {

  var page = config.page;
  var actionUri = config.actionUri;

  page = new Buffer(page.toString().replace('##ACTIONURI##', actionUri));

  return function (req, resp, next) {
    
  };
};