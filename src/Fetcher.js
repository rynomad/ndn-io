var ndn, contrib;

/** Fetcher object
 *@constructore
 *@param {IO}  io the IO instance
 *@param {String=} uri the uri of the desired object
 *@param {Number=} interestLifetimeMilliseconds the Interest Lifetime in Milliseconds (per interest)
 *@returns {Fetcher}
 */
function Fetcher (io, uri, interestLifetimeMilliseconds){
  this.io = io;
  this.name = new ndn.Name(uri);
  this.masterInterest = new ndn.Interest(this.name);
  this.setInterestLifetimeMilliseconds(interestLifetimeMilliseconds);
  this.setMinSuffixComponents(0);
  this.setMaxSuffixComponents(0);
  this.interestLifetimeMilliseconds = interestLifetimeMilliseconds;
  return this;
}

/** import ndn-contrib into Class scope
 *@static
 *@param {Object} NDN the ndn-contrib object
 */
Fetcher.installContrib = function(ndncontrib){
  ndn = ndncontrib.ndn;
  contrib = ndncontrib;
};

Fetcher.prototype.setName = function(uri){
  this.name = new ndn.Name(uri);
  this.masterInterest.setName(this.name);
  return this;
};

Fetcher.prototype.setInterestLifetimeMilliseconds = function(milliseconds){
  this.masterInterest.setInterestLifetimeMilliseconds(milliseconds);
  return this;
};

Fetcher.prototype.setMinSuffixComponents = function(count){
  this.masterInterest.setMinSuffixComponents(count);
  return this;
};


Fetcher.prototype.setMaxSuffixComponents = function(count){
  this.masterInterest.setMaxSuffixComponents(count);
  return this;
};

Fetcher.prototype.setExclude = function(excludeArray){
  this.masterInterest.setMaxSuffixComponents(count);
  return this;
};

Fetcher.prototype.assembleString = function(contentArray){
  var string = "";
  for (var i = 0; i < contentArray.length; i++){
    string += contentArray[i].toString();
  }
  return string;
};

Fetcher.prototype.assembleJSON = function(contentArray){
  return JSON.parse(this.assembleString(contentArray));
};

Fetcher.prototype.assembleFile = require("./node/assembleFile.js");

Fetcher.prototype.getFile = function(mimeString, callback, timeout){
  var Self = this;
  this.get(function(contentArray){
    callback(Self.assembleFile(contentArray, mimeString));
  }, timeout);
};

Fetcher.prototype.getString = function( callback, timeout){
  var Self = this;
  this.get(function(contentArray){
    callback(Self.assembleString(contentArray));
  }, timeout);
};

Fetcher.prototype.getJSON = function(mimeString, callback, timeout){
  var Self = this;
  this.get(function(contentArray){
    callback(Self.assembleJSON(contentArray, mimeString));
  }, timeout);
};

Fetcher.prototype.get = function(uri, interestLifetimeMilliseconds, callback, timeout ){

  if (typeof uri === "function") {
    callback = uri;
    timeout = interestLifetimeMilliseconds;
  } else if (typeof interestLifetimeMilliseconds === "function"){
    this.setName(uri);
    callback = interestLifetimeMilliseconds;
    timeout = callback;
  } else {
    this.setName(uri);
    this.setInterestLifetimeMilliseconds(interestLifetimeMilliseconds);
  }

  var totalSegments = null;
  var segmentsRetrieved = 0;
  var contentArray = [];

  function onEachData (element, data, finalBlockID){
    if (!totalSegments){
      totalSegments = 1 + ndn.DataUtils.bigEndianToUnsignedInt(finalBlockID);
    }

    var segmentNumber = ndn.DataUtils.bigEndianToUnsignedInt(data.name.get(-1).getValue().buf());
    contentArray[segmentNumber] = data.content;
    segmentsRetrieved++;
    if (segmentsRetrieved === totalSegments){
      callback(contentArray);
    }

  }

  this.io.fetchAllSegments(this.masterInterest, onEachData, timeout );
};

module.exports = Fetcher;
