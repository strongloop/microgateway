// © Copyright IBM Corporation 2016,2017.
// Node module: microgateway
// LICENSE: Apache 2.0, https://www.apache.org/licenses/LICENSE-2.0

'use strict';

var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var ldap = require('ldapjs');
var Promise = require('bluebird');

var userfile = path.join(__dirname, 'users.json');

module.exports = function(server, authreq) {
  var users = {};

  function authorize(req, res, next) {
    if (authreq === false) {
      return next();
    }
    if (!(req.connection.ldap.bindDN.equals('cn=root') ||
        req.connection.ldap.bindDN.equals('uid=alice, ou=people, dc=sixfour1, dc=com'))) {
      return next(new ldap.InsufficientAccessRightsError());
    }
    return next();
  }

  function doBind(key, user) {
    server.bind(user.dn, function(req, res, next) {
      if (req.dn.toString() !== user.dn || req.credentials !== user.pass) {
        return next(new ldap.InvalidCredentialsError());
      }
      res.end();
      return next();
    });
    users[key] = user;
  }

  function loadPasswdFile() {
    return new Promise(function(resolve, reject) {
      fs.readFile(userfile, 'utf8', function(err, data) {
        if (err) {
          return reject(err);
        }

        var userdata = JSON.parse(data);

        _.forEach(userdata, function(user, key) {
          if (typeof user[key] === 'undefined') {
            doBind(key, user);
          }
        });

        resolve(users);
      });
    });
  }

  return loadPasswdFile().then(function() {
    server.bind('cn=root', function(req, res, next) {
      if (req.dn.toString() !== 'cn=root' || req.credentials !== 'secret') {
        return next(new ldap.InvalidCredentialsError());
      }
      res.end();
      return next();
    });

    server.bind('cn=slow,ou=myorg,ou=com', function(req, res, next) {
      setTimeout(function() {
        if (req.dn.toString() !== 'cn=slow,ou=myorg,ou=com' || req.credentials !== 'slowpass') {
          return next(new ldap.InvalidCredentialsError());
        }
        res.end();
        next();
      }, 12000);
    });

    server.search('ou=myorg,ou=com', authorize, function(req, res, next) {
      _.forEach(users, function(user) {
      // for (var user of users.values()) {
        if (req.filter.matches(user.attributes)) {
          res.send(user);
        }
      });
      res.end();
      return next();
    });
    server.search('uid=alice,ou=people,dc=sixfour1,dc=com', authorize, function(req, res, next) {
      _.forEach(users, function(user) {
      // for (var user of users.values()) {
        if (req.filter.matches(user.attributes) &&
            user.dn === 'uid=alice, ou=people, dc=sixfour1, dc=com') {
          res.send(user);
        }
      });
      res.end();
      return next();
    });
  });
};
