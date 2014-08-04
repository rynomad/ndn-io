
module.exports = function(file){
  var buffer;
  if (file instanceof File){
    var reader = new FileReaderSync();
    buffer = reader.readAsArrayBuffer(file);
  } else if (file instanceof Blob || Buffer){
    buffer = file;
  }
  return buffer;
};
