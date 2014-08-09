var fs = require("fs");

module.exports = function(file) {
  var buffer;
  if (typeof file === "string") {
    buffer = fs.readFileSync(file);
  } else if (file instanceof Buffer){
    buffer = file;
  }
  return buffer;
};
