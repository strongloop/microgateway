'use strict';

var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var ldap = require('ldapjs');

var userfile = path.join(__dirname, 'users.json');

module.exports = function (server, authreq) {

  var users = new Map();

  function authorize (req, res, next) {
    if (authreq === false)
      return next();
    if (!req.connection.ldap.bindDN.equals('cn=root'))
      return next(new ldap.InsufficientAccessRightsError());
    return next();
  }

  function doBind (key, user) {
    server.bind(user.dn, function(req, res, next) {
      if (req.dn.toString() !== user.dn || req.credentials !== user.pass)
        return next(new ldap.InvalidCredentialsError());
      res.end();
      return next();
    });
    users.set(key, user);
  }

  function loadPasswdFile () {
    return new Promise(function (resolve, reject) {
      fs.readFile(userfile, 'utf8', function (err, data) {
        if (err)
          return reject(err);

        var userdata = JSON.parse(data);

        _.forEach(userdata, function(user, key) {
          if (!users.has(key))
            doBind(key, user);
        });

        resolve(users);
      });
    });
  }

  return loadPasswdFile().then(function() {
    server.bind('cn=root', function (req, res, next) {
      if (req.dn.toString() !== 'cn=root' || req.credentials !== 'secret')
        return next(new ldap.InvalidCredentialsError());
      res.end();
      return next();
    });


    server.search('ou=myorg,ou=com', authorize, function (req, res, next) {
      for (let user of users.values()) {
        if (req.filter.matches(user.attributes)) {
          res.send(user);
        }
      }
      res.end();
      return next();
    });
  });
};
