// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.
if (process.env.NODE_ENV === undefined)
  process.env.NODE_ENV = 'production';
require('./lib/microgw.js').start(process.env.PORT || 5000);
