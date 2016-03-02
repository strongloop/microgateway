'use strict';

var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:policy-loader'});
const assert   = require('assert');
const _        = require('lodash');
const fs       = require('fs');
const chokidar = require('chokidar');
const pathM    = require('path');
const osenv    = require('osenv');
const apicConfig = require('apiconnect-cli-config');

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
        abspaths.forEach(path => {
            assert(_.isString(path) && pathM.isAbsolute(path),
                    'require abs path');
        });
    } else {
        abspaths = [abspaths];
    }
    return new PolicyLoader(abspaths, policyCfgs || {});
}

/**
 * ctor function for PolicyLoader
 * @param paths an array of paths that are used to lookup the policies
 * @param policyCfgs optional param. pass the policy config if needed
 */
function PolicyLoader(paths, policyCfgs) {
    this._policies = {};
    this._policyCfgs = policyCfgs || {};
    let override = true;
    if (_.isBoolean(policyCfgs.override)) {
        override = policyCfgs.override;
    }
    paths.forEach( path => {
        let policyDirs = fs.readdirSync(path);
        let emptyObj = {};
        let localCfg = {};
        try {
            //try to load the local config if there is
            localCfg = require(path + '/policy-config.json');
        } catch (e) {
            //ignore
        }
        policyDirs.forEach( policyDir => {
            if (this._policies[policyDir] && override === false) {
                //no override
                return;
            }
            let stat = fs.statSync(pathM.resolve(path, policyDir));
            if (stat.isDirectory()) {
                try {
                    let policyFunc = require(path + '/' + policyDir);
                    //local config ==> global level config
                    let policyCfg  =  localCfg[policyDir] ||
                        this._policyCfgs[policyDir] ||
                        emptyObj;

                    this._policies[policyDir] = policyFunc(policyCfg);
                } catch (err) {
                    //TODO: use logger instead of console
                    //unable to load the policy module, skip
                    logger.debug('Skip', policyDir,
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
        this._watcher.on('change', (path, stat) => {
            if (stat) logger.debug(`File ${path} changed`);
            //TODO: update this.policies, there would be multiple
            //event for a policy, need to find a way to filter out
        });
    }
}

/**
 * disable watcher
 */
PolicyLoader.prototype.watchEnd = function () {
    if(this._watcher instanceof chokidar.FSWatcher) {
        this._watcher.close();
        delete this._watcher;
    }
}

/**
 * get all policies function that under the specified path
 */
PolicyLoader.prototype.getPolicies = function () {
    return this._policies;
}

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

    let locations = [ pathM.resolve(__dirname, '..', 'policies')];
    var projectInfo = apicConfig.inspectPath(process.cwd());
    assert(projectInfo.type === 'project', 'only support project');

    var config = apicConfig.loadConfig({
        projectDir: projectInfo.basePath,
        shouldParseUris: false}
    );

    let loadUserSettings = true;
    //2.1 load project specific settings
    let obj =
        config.get('userPolicies', apicConfig.PROJECT_STORE);
    if (obj.userPolicies && _.isArray(obj.userPolicies)) {
        //if the location is related path, prepend projectDir
        obj.userPolicies.forEach(location => {
            if (pathM.isAbsolute(location)) {
                locations.push(location);
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
        let obj = config.get('userPolicies', apicConfig.USER_STORE);
        if (obj.userPolicies && _.isArray(obj.userPolicies)) {
            //if the location is related path, prepend APIC_CONFIG_PATH
            var configDir = process.env.APIC_CONFIG_PATH ||
                path.resolve(osenv.home(), '.apiconnect')
            obj.userPolicies.forEach(location => {
                if (pathM.isAbsolute(location)) {
                    locations.push(location);
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
