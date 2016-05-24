var session = require("express-session");
var crypto = require('crypto');

module.exports = function (config) {
  var secret = config.secret || crypto.randomBytes(64).toString('hex');

  return session(
      {resave: true,
        saveUninitialized: true,
        secret: secret,
        cookie: { maxAge: 600000 }
      });
};