'use strict';

const assert   = require('assert');
const _        = require('lodash');
const fs       = require('fs');
const chokidar = require('chokidar');
const pathSep  = require('path').sep;

/**
 * create a loader instance. calling this API in
 * init state because it calls the fs sync API to
 * scan the policy directory. A loader instance is
 * responsible for a specific path.
 * 
 * Note: please use absolute path for now
 * @param abspath where to lookup the policies
 * @param policyCfgs optional param. pass the policy config if needed
 * @return the loader instance
 */
exports.create = function(abspath, policyCfgs) {
    return new PolicyLoader(abspath, policyCfgs);
}

/**
 * ctor function for PolicyLoader
 * @param abspath where to lookup the policies
 * @param policyCfgs optional param. pass the policy config if needed
 */
function PolicyLoader(path, policyCfgs) {
    assert(_.isString(path) && path[0] === pathSep, 'create(abspath)');
    this._policies = {};
    this._policyCfgs = policyCfgs || {};
    var policyDirs = fs.readdirSync(path);
    var emptyObj = {};
    policyDirs.forEach( policyDir => {
        let stat = fs.statSync(path + pathSep + policyDir);
        if (stat.isDirectory()) {
            try {
                let policyFunc = require(path + '/' + policyDir);
                let policyCfg  = this._policyCfgs[policyDir] || emptyObj;
                this._policies[policyDir] = policyFunc(policyCfg);
            } catch (err) {
                //TODO: log?
                //unable to load the policy module, skip
            }
        }
    });
    Object.defineProperty(this, '_path', { value: path, 
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
            if (stat) console.log(`File ${path} changed`);
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
