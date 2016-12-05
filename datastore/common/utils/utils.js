// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict';

var path = require('path');
var fs = require('fs');
var logger = require('apiconnect-cli-logger/logger.js')
                  .child({ loc: 'microgateway:datastore:common:utils' });
var project = require('apiconnect-project');

exports.storeDataStorePort = function(port) {
  var localPath = getDataStorePath();
  try {
    var contents = JSON.parse(fs.readFileSync(localPath));
    contents.port = port;
    fs.writeFileSync(localPath, JSON.stringify(contents), 'utf8');
  } catch (e) {
    fs.writeFileSync(localPath, JSON.stringify({ port: port }), 'utf8');
  }
};

exports.setPreviousSnapshotDir = function(snapshotDir) {
  var localPath = getDataStorePath();
  try {
    var contents = JSON.parse(fs.readFileSync(localPath));
    contents.snapshot = snapshotDir;
    fs.writeFileSync(localPath, JSON.stringify(contents), 'utf8');
  } catch (e) {
    fs.writeFileSync(localPath, JSON.stringify({ snapshot: snapshotDir }), 'utf8');
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
    var projectInfo = project.inspectPath(process.env.ORIG_CONFIG_DIR);
    localPath = path.join(projectInfo.basePath, localPath);
  }
  logger.debug('.datastore path:', localPath);
  return localPath;
};
exports.getDataStorePath = getDataStorePath;
