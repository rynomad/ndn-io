var fs = require("fs");

module.exports = function(file) {
  var buffer;
  if (file instanceof "string") {
    buffer = fs.readFileSync(file);
  } else if (file instanceof Buffer){
    buffer = file;
  }
  return buffer;
};
