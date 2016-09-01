// Copyright (c) IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// This project is licensed under the MIT License, see LICENSE.txt

'use strict';

var path = require('path');
var fs = require('fs');
var logger = require('apiconnect-cli-logger/logger.js')
                  .child({ loc: 'microgateway:datastore:common:utils' });
var cliConfig = require('apiconnect-cli-config');

exports.storeDataStorePort = function(port) {
  var localPath = getDataStorePath();
  try {
    var contents = JSON.parse(fs.readFileSync(localPath));
    contents.port = port;
    fs.writeFile(localPath, JSON.stringify(contents), 'utf8', function(err) {
      if (err) {
        throw err;
      }
    });
  } catch (e) {
    fs.writeFile(localPath, JSON.stringify({ port: port }), 'utf8', function(err) {
      if (err) {
        throw err;
      }
    });
  }
};

exports.setPreviousSnapshotDir = function(snapshotDir) {
  var localPath = getDataStorePath();
  try {
    var contents = JSON.parse(fs.readFileSync(localPath));
    contents.snapshot = snapshotDir;
    fs.writeFile(localPath, JSON.stringify(contents), 'utf8', function(err) {
      if (err) {
        throw err;
      }
    });
  } catch (e) {
    fs.writeFile(localPath, JSON.stringify({ snapshot: snapshotDir }), 'utf8', function(err) {
      if (err) {
        throw err;
      }
    });
  }
};

exports.getPreviousSnapshotDir = function() {
  var localPath = getDataStorePath();
  try {
    var contents = JSON.parse(fs.readFileSync(localPath));
    return contents.snapshot;
  } catch (e) {
    return undefined;
  }
};

function getDataStorePath() {

  var localPath = '.datastore';
  if (process.env.ORIG_CONFIG_DIR) {
    var projectInfo = cliConfig.inspectPath(process.env.ORIG_CONFIG_DIR);
    localPath = path.join(projectInfo.basePath, localPath);
  }
  logger.debug('.datastore path:', localPath);
  return localPath;
};
exports.getDataStorePath = getDataStorePath;
