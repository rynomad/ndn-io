var fs = require("fs");

module.exports = function(file) {
  var buffer;
  console.log(file)
  console.log(typeof file)
  console.log(file instanceof Buffer)
  if (typeof file === "string") {
    buffer = fs.readFileSync(file);
  } else if (file instanceof Buffer){
    buffer = file;
  }
  return buffer;
};
