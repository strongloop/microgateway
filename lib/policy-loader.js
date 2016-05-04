// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var logger   = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'microgateway:policy-loader'});
var assert   = require('assert');
var _        = require('lodash');
var fs       = require('fs');
var chokidar = require('chokidar');
var pathM    = require('path');
var osenv    = require('osenv');
var apicConfig = require('apiconnect-cli-config');

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
                    'require abs path');
        });
    } else {
        abspaths = [abspaths];
    }
    return new PolicyLoader(abspaths, policyCfgs || {});
}

/**
 * Helper function that reads provided user policy directories and catches errors
 * @param path
 * @returns {*}
 */
function readPathDir (path) {
    var policyDirs;

    try {
        policyDirs = fs.readdirSync(path);
    }

    catch (err) {
        logger.warn('Error when reading %s. Skipping.', err);
    }

    return policyDirs;
}

/**
 * ctor function for PolicyLoader
 * @param paths an array of paths that are used to lookup the policies
 * @param policyCfgs optional param. pass the policy config if needed
 */
function PolicyLoader(paths, policyCfgs) {
    this._policies = {};
    this._policyCfgs = policyCfgs || {};
    var override = true;
    var _this = this;
    if (_.isBoolean(policyCfgs.override)) {
        override = policyCfgs.override;
    }
    paths.forEach( function(path) {
        var policyDirs = readPathDir(path);

        if (!_.isArray(policyDirs))
            return;

        var emptyObj = {};
        var localCfg = {};
        try {
            //try to load the local config if there is
            localCfg = require(path + '/policy-config.json');
        } catch (e) {
            //ignore
            logger.debug('no policy-config in ', path);
        }
        policyDirs.forEach( function(policyDir) {
            if (_this._policies[policyDir] && override === false) {
                //no override
                return;
            }
            var stat = fs.statSync(pathM.resolve(path, policyDir));
            var policyFunc, policyCfg;
            if (stat.isDirectory()) {
                try {
                    policyFunc = require(path + '/' + policyDir);
                    //local config ==> global level config
                    policyCfg  =  localCfg[policyDir] ||
                        _this._policyCfgs[policyDir] ||
                        emptyObj;

                    _this._policies[policyDir] = policyFunc(policyCfg);
                } catch (err) {
                    //unable to load the policy module, skip
                    logger.error('Skip', policyDir,
                        ', micro-gateway failed to load policy from',
                        path + '/' + policyDir, ':', err);
                }
            }
        });
    });
    Object.defineProperty(this, '_paths', { value: paths,
        writable: false,
        enumerable: false,
        configurable: false } );
}

/**
 * start to watch the policy path
 */
PolicyLoader.prototype.watchStart = function () {
    if(_.isUndefined(this._watcher)) {
        //TODO: or maybe only watch policy.yml for each policy
        this._watcher = chokidar.watch(this._path);
        this._watcher.on('change', function(path, stat) {
            if (stat) logger.debug('File %s changed', path);
            //TODO: update this.policies, there would be multiple
            //event for a policy, need to find a way to filter out
        });
    }
};

/**
 * disable watcher
 */
PolicyLoader.prototype.watchEnd = function () {
    if(this._watcher instanceof chokidar.FSWatcher) {
        this._watcher.close();
        delete this._watcher;
    }
};

/**
 * get all policies function that under the specified path
 */
PolicyLoader.prototype.getPolicies = function () {
    return this._policies;
};

//TODO policy validator??!!

//create policy loader for micro-gateway
exports.createMGLoader = function (options) {
    options = options || {};
    //loading procedures:
    //1. always load policies in resolve(__dirname, '..', 'policies')
    //2. check 'userPolicies' in (either one, project first):
    //   - 2.1: if cwd() is a loopback project, check .apiconnect.
    //      - if 'userPolicies' presents, add locations. if not, go
    //        to 2.2
    //   - 2.2: check home/.apiconnect/config
    //      - if 'userPolicies' presents, add locations

    var locations = [ pathM.resolve(__dirname, '..', 'policies')];
    var projectCwd = process.env.CONFIG_DIR;
    if (typeof projectCwd === 'undefined') {
      projectCwd = process.cwd();
    }
    var projectInfo = apicConfig.inspectPath(projectCwd);

    var config = apicConfig.loadConfig({
        projectDir: projectInfo.basePath,
        shouldParseUris: false}
    );

    var loadUserSettings = true;
    //2.1 load project specific settings
    var obj =
        config.get('userPolicies', apicConfig.PROJECT_STORE);
    if (obj.userPolicies && _.isArray(obj.userPolicies)) {
        //if the location is related path, prepend projectDir
        obj.userPolicies.forEach(function(location) {
            if (pathM.isAbsolute(location)) {
                locations.push(location);
            } else if (location.substring(0,2) === '~/') {
              locations.push(
                  pathM.resolve(projectInfo.basePath,
                      osenv.home(),
                      location.substring(2)));
            } else {
                locations.push(
                    pathM.resolve(projectInfo.basePath, location));
            }
        });
        //already load project specific settings, skip global one
        loadUserSettings = false;
    }
    //2.2 load global settings from home directory
    if (loadUserSettings) {
        var obj = config.get('userPolicies', apicConfig.USER_STORE);
        if (obj.userPolicies && _.isArray(obj.userPolicies)) {
            //if the location is related path, prepend APIC_CONFIG_PATH
            var configDir = process.env.APIC_CONFIG_PATH ||
                pathM.resolve(osenv.home(), '.apiconnect');
            obj.userPolicies.forEach(function(location) {
                if (pathM.isAbsolute(location)) {
                    locations.push(location);
                } else if (location.substring(0,2) === '~/') {
                  locations.push(
                      pathM.resolve(configDir,
                          osenv.home(),
                          location.substring(2)));
                } else {
                    locations.push(
                        pathM.resolve(configDir, location));
                }
            });
        }
    }

    return create(locations, options || {});
};

exports.create = create;
