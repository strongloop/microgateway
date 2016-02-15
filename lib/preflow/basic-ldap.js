'use strict';

let LdapAuth = require('ldapauth-fork');
let auth = require('basic-auth');

// Export a function that returns an API object
module.exports = function (options, persist) {
  let ldap;

  if (persist === true)
    ldap = new LdapAuth(options);

  function end () {
    if (persist !== true) {
      ldap.close();
      ldap = null;
    }
  }

  // Given a username and password, authenticate against LDAP
  function authenticate (user, pass) {
    return new Promise(function (resolve, reject) {
      ldap = ldap || new LdapAuth(options);
      ldap.authenticate(user, pass, function (err, user) {
        if (err) {
          end();
          reject(err);
          return;
        }
        end();
        resolve(user);
      });
    });
  }

  // Provide ability to parse requests for Basic Auth
  function parse (req) {
    return new Promise(function (resolve, reject) {
      let user = auth(req);
      if (!user) {
        reject({
          error: new Error('No basic auth provided!')
        });
        return;
      }
      resolve({ username: user.name, password: user.pass });
    });
  }

  return { parse: parse, authenticate: authenticate };
};

