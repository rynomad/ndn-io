module.exports = function(contentArray, mimeType){
  return new Blob(contentArray, mimeType);
};
