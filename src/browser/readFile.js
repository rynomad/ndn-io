
module.exports = function(file, callback){
  var buffer;
  if (file instanceof File){
    var reader = new FileReader();
    reader.onloadend = function(e){
      //console.log("reader.onLoadEnd triggered", e)
      callback(new Buffer(new Uint8Array(e.target.result)));
    }
    reader.readAsArrayBuffer(file);
  } else if (file instanceof Blob || Buffer){
    buffer = file;
    callback(buffer)
  }
  return buffer;
};
