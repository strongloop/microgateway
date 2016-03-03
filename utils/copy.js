var fs = require('fs');
var path = require('path');


function copyRecursive(src, dest) {
  var exists = fs.existsSync(src);
  var stats = exists && fs.statSync(src);
  var isDirectory = exists && stats.isDirectory();
  if (exists && isDirectory) {
    fs.mkdirSync(dest);
    fs.readdirSync(src).forEach(function(childItemName) {
      copyRecursive(path.join(src, childItemName),
                        path.join(dest, childItemName));
    });
  } else {
    fs.writeFileSync(dest, fs.readFileSync(src));
    }
};

function deleteRecursive(dest) {
  var exists = fs.existsSync(dest);
  var stats = exists && fs.statSync(dest);
  var isDirectory = exists && stats.isDirectory();
  if (exists && isDirectory) {
    fs.readdirSync(dest).forEach(function(childItemName) {
      deleteRecursive(path.join(dest, childItemName));
    });
    fs.rmdirSync(dest);
  } else {
    fs.unlinkSync(dest);
    }
};

exports.copyRecursive = copyRecursive;
exports.deleteRecursive = deleteRecursive;
