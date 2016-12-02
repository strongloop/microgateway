// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
        .child({ loc: 'microgateway:policy-loader' });
var apicConfig = require('apiconnect-config');
var assert = require('assert');
var _ = require('lodash');
var fs = require('fs');
var js2yaml = require('js-yaml');
var chokidar = require('chokidar');
var glob = require('glob');
var pathM = require('path');
var osenv = require('osenv');
var semver = require('semver');
var project = require('apiconnect-project');

/**
 * create a loader instance. calling this API in
 * init state because it calls the fs sync API to
 * scan the policy directory. A loader instance is
 * responsible for a specific path.
 *
 * Note: please use absolute path for now
 * @param abspaths where to lookup the policies
 * @param policyCfgs optional param. pass the policy config if needed
 * @return the loader instance
 */
function create(abspaths, policyCfgs) {
  if (_.isArray(abspaths)) {
    abspaths.forEach(function(path) {
      assert(_.isString(path) && pathM.isAbsolute(path),
          'Policies require absolute path');
    });
  } else {
    abspaths = [ abspaths ];
  }
  var policyDescriptions = getPolicyDescriptors(abspaths);

  return new PolicyLoader(policyDescriptions, policyCfgs || {});
}

/**
 * Helper function that reads provided user policy directories and catches errors
 * @param path
 * @returns {*}
 */
function readPathDir(path) {
  var policyDirs;
  try {
    policyDirs = fs.readdirSync(path);
  } catch (err) {
    logger.warn('Error when reading %s. Skipping.', err);
  }

  return policyDirs;
}

/**
 * ctor function for PolicyLoader
 * @param policyDescriptions array of descriptors for each policy found
 * @param policyCfgs optional param. pass the policy config if needed
 */
function PolicyLoader(policyDescriptions, policyCfgs) {
  this._policies = {};
  this._policyCfgs = policyCfgs || {};
  var paths = [];
  var policyVersions = [];
  var override = true;
  var _this = this;

  if (_.isBoolean(policyCfgs.override)) {
    override = policyCfgs.override;
  }

  policyDescriptions.forEach(function(policy) {
    var policyDirs = readPathDir(policy.path);

    if (!_.isArray(policyDirs)) {
      return;
    }

    var emptyObj = {};
    var localCfg = {};
    try {
      //try to load the local config if there is
      localCfg = require(policy.path + '/policy-config.json');
    } catch (e) {
      //ignore
      logger.debug('no policy-config in ', policy.path);
    }

    var policyIndex = policy.version ? policy.name + ':' + policy.version : policy.name;
    var makePolicyDefault = true;
    var exactMatchFound = false;

    // Check to see we have loaded a policy with the same name. If yes,
    // then we will need to see if this new policy is a higher version
    if (policyVersions[policy.name]) {
      // Check to see if the policy version already exists in the
      // policyVersions array, and/or check to see if it is greater than
      // the existing policyVersions
      var versionArray = policyVersions[policy.name];

      versionArray.forEach(function(version) {
        if (semver.lt(policy.version, version)) {
          makePolicyDefault = false;
        } else if (semver.eq(policy.version, version)) {
          if (override === true) {
            // Warning, same policy version was found twice. discarding duplicate.
            logger.warn('Duplicate policy version (%s) found at: %s - replacing original',
                    policyIndex, policy.path);
          } else {
            // Warning, same policy version was found twice. discarding duplicate.
            logger.warn('Duplicate policy version (%s) found at: %s - skipping',
                    policyIndex, policy.path);
            exactMatchFound = true;
          }
        }
      });

      if (!exactMatchFound) {
        versionArray.push(policy.version);
        paths.push(policy.path);
      }
    } else {
      // This is the first policy with this name, add a new array element
      policyVersions[policy.name] = [ policy.version ];
      paths.push(policy.path);
    }

    if (!exactMatchFound) {
      if (_this._policies[policyIndex] && override === false) {
        //no override
        return;
      }

      var stat = fs.statSync(pathM.resolve(policy.path));
      var policyFunc;
      var policyCfg;
      if (stat.isDirectory()) {
        try {
          policyFunc = require(policy.path);
          //local config ==> global level config
          policyCfg = localCfg || _this._policyCfgs[policyIndex] || emptyObj;

          var policyImpl = policyFunc(policyCfg);
          _this._policies[policyIndex] = policyImpl;

          if (makePolicyDefault) {
            _this._policies[policy.name] = policyImpl;
          }
        } catch (err) {
          //unable to load the policy module, skip
          logger.error('Skip %j, micro-gateway failed to load policy from %s: %s',
              policyDirs, policy.path, err);
        }
      }
    }
  });

  if (logger.debug()) {
    logger.debug('policies:', _this._policies);
  }
  Object.defineProperty(this, '_paths',
          { value: paths, writable: false, enumerable: false, configurable: false });
}

/**
 * start to watch the policy path
 */
PolicyLoader.prototype.watchStart = function() {
  if (_.isUndefined(this._watcher)) {
    //TODO: or maybe only watch policy.yml for each policy
    this._watcher = chokidar.watch(this._path);
    this._watcher.on('change', function(path, stat) {
      if (stat) {
        logger.debug('File %s changed', path);
      }
      //TODO: update this.policies, there would be multiple
      //event for a policy, need to find a way to filter out
    });
  }
};

/**
 * disable watcher
 */
PolicyLoader.prototype.watchEnd = function() {
  if (this._watcher instanceof chokidar.FSWatcher) {
    this._watcher.close();
    delete this._watcher;
  }
};

/**
 * get all policies function that under the specified path
 */
PolicyLoader.prototype.getPolicies = function() {
  return this._policies;
};

//TODO policy validator??!!

//create policy loader for micro-gateway
exports.createMGLoader = function(options) {
  options = options || {};
  //loading procedures:
  //1. always load policies in resolve(__dirname, '..', 'policies')
  //2. check 'userPolicies' in (either one, project first):
  //   - 2.1: if cwd() is a loopback project, check .apiconnect.
  //      - if 'userPolicies' presents, add locations. if not, go
  //        to 2.2
  //   - 2.2: check home/.apiconnect/config
  //      - if 'userPolicies' presents, add locations

  var locations = [
    pathM.resolve(__dirname, '..', 'policies'),
    pathM.resolve(__dirname, '..', 'userPolicies') ];

  if (process.env.POLICY_DIR) {
    locations.push(pathM.resolve(process.env.POLICY_DIR));
  }

  var projectCwd = process.env.CONFIG_DIR;
  if (typeof projectCwd === 'undefined') {
    projectCwd = process.cwd();
  }
  var projectInfo = project.inspectPath(projectCwd);

  var config = apicConfig.loadConfig({
    projectDir: projectInfo.basePath,
    shouldParseUris: false });

  var loadUserSettings = true;
  //2.1 load project specific settings
  var obj = config.get('userPolicies', apicConfig.PROJECT_STORE);
  if (obj.userPolicies && _.isArray(obj.userPolicies)) {
    //if the location is related path, prepend projectDir
    obj.userPolicies.forEach(function(location) {
      if (pathM.isAbsolute(location)) {
        locations.push(location);
      } else if (location.substring(0, 2) === '~/') {
        locations.push(pathM.resolve(
                    projectInfo.basePath,
                    osenv.home(),
                    location.substring(2)));
      } else {
        locations.push(pathM.resolve(projectInfo.basePath, location));
      }
    });
    //already load project specific settings, skip global one
    loadUserSettings = false;
  }

  //2.2 load global settings from home directory
  if (loadUserSettings) {
    obj = config.get('userPolicies', apicConfig.USER_STORE);
    if (obj.userPolicies && _.isArray(obj.userPolicies)) {
      //if the location is related path, prepend APIC_CONFIG_PATH
      var configDir = process.env.APIC_CONFIG_PATH ||
          pathM.resolve(osenv.home(), '.apiconnect');
      obj.userPolicies.forEach(function(location) {
        if (pathM.isAbsolute(location)) {
          locations.push(location);
        } else if (location.substring(0, 2) === '~/') {
          locations.push(pathM.resolve(
                      configDir,
                      osenv.home(),
                      location.substring(2)));
        } else {
          locations.push(pathM.resolve(configDir, location));
        }
      });
    }
  }

  return create(locations, options || {});
};

/* Use glob to find policies in policies/, userPolicies/ and places specified by config files */
function getPolicyDescriptors(locations) {
  var policyInfo = [];
  locations.forEach(function(loc) {
    if (/policy\.(ya?ml|YA?ML)$/.test(loc)) {
      console.warn('getUserPolicies():', loc, ' appears to be a full path to a policy file.',
              'Please provide a path to the directory in which the policy exists instead.');
    }

    var yamlpath = loc + '/policy.+(yml|yaml|YML|YAML)';
    var files = glob.sync(yamlpath);
    logger.debug('files in immediate directory', files);
    if (!files || files.length === 0) {
      // Parent directory case
      yamlpath = loc + '/*/policy.+(yml|yaml|YML|YAML)';
      files = glob.sync(yamlpath);
      logger.debug('files in child directories', files);
    }

    files.forEach(function(file) {
      try {
        var doc = js2yaml.safeLoad(fs.readFileSync(file, 'utf8'));
        if (typeof doc.policy === 'string' && typeof doc.info.name === 'string') {
          var policyPath = pathM.dirname(file);
          var policyVersion = doc.info.version || '0.0.0';
          policyInfo.push({ file: file, path: policyPath, name: doc.info.name, version: policyVersion });
        }
      } catch (e) {
        console.log('Error loading policy YAML for: ' + file);
        console.log(e);
      }
    });
  });

  return policyInfo;
};

exports.create = create;
