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
  this.masterInterest.setInterestLifetimeMilliseconds(interestLifetimeMilliseconds);
  this.masterInterest.setMinSuffixComponents(0);
  this.masterInterest.setMaxSuffixComponents(0);
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
  this.masterInterest.setName(this.name.appendSegment(0));
  return this;
};

Fetcher.prototype.setType = function(type){
  this.type = type;
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

Fetcher.prototype.get = function(callback){
  if (!this.type || (!(this.type === "object" || "json" || "string" ) && (this.type.indexOf("/") === -1))){
    callback(new TypeError("must call .setType with mimeString, 'object', 'json', 'string' || 'text'"));
  } else{
    if ((this.type === "file")||(this.type.split("/").length === 2)){
      if (this.type.split(":").length === 2){
        this.getAsObjectURL(callback);
      } else {
        this.getAsFile(callback);
      }
      return this;
    } else if ((this.type === "object") || (this.type === "json")){
      console.log("!!!!!!!!!!!!!!!!!!!",this.type, (this.type === ("object" || "json")))
      this.getAsJSON(callback);
      return this;
    } else if (this.type === "string" || "text"){
      this.getAsString(callback);
      return this;
    }
  }
  return this;
};

Fetcher.prototype.assembleString = function(contentArray){
  var string = "";
  for (var i = 0; i < contentArray.length; i++){
    string += contentArray[i].toString();
  }
  console.log("string assembled!!!!!!!!!!!!!!!!!!!!!!!!!!!!!", string)
  return string;
};

Fetcher.prototype.assembleJSON = function(contentArray){
  return JSON.parse(this.assembleString(contentArray));
};

Fetcher.prototype.assembleFile = require("./node/assembleFile.js");

Fetcher.prototype.getAsFile = function( callback, timeout){
  var Self = this
    , type = (this.type.indexOf("url:") === 0) ? this.type.substring(4) : this.type;

  this.getParts(function(err, contentArray){
    if (err){
      callback(err);
    } else {
      callback(null, Self.assembleFile(contentArray, type));
    }
  });
  return this;
};

Fetcher.prototype.getAsString = function( callback, timeout){
  var Self = this;
  this.getParts(function(err, contentArray){
    if (err){
      callback(err);
    } else {
      callback(null, Self.assembleString(contentArray));
    }
  });
  return this;
};

Fetcher.prototype.getAsObjectURL = (function(){
  var Self = this;
  try {
    if (URL){
      return function getObjectUrl(callback, timeout){
        Self.getAsFile(function(err, blob){
          if (err){
            callback(err);
          } else {
            callback(null, URL.createObjectURL(blob));
          }
        });
        return this;
      };
    }
    return function(){console.log("no URL support on this platform"); return this;};
  } catch(e){
    return function(){console.log("no URL support on this platform"); return this;};
  }
})();

Fetcher.prototype.getAsJSON = function(callback){
  var Self = this;
  this.getParts(function(err, contentArray){
    //console.log("what am I getting in .json getParts?", err, contentArray)
    callback(err, Self.assembleJSON(contentArray));
  });
};

Fetcher.prototype.getParts = function(uri, interestLifetimeMilliseconds, callback){
  if (typeof uri === "function") {
    callback = uri;
  } else if (typeof interestLifetimeMilliseconds === "function"){
    this.setName(uri);
    callback = interestLifetimeMilliseconds;
  } else {
    this.setName(uri);
    this.setInterestLifetimeMilliseconds(interestLifetimeMilliseconds);
  }

  var totalSegments = null;
  var segmentsRetrieved = 0;
  var contentArray = [];

  function onEachData (element, data, finalBlockID){
    if (!totalSegments){
      try{
        totalSegments = 1 + ndn.DataUtils.bigEndianToUnsignedInt(finalBlockID);
      } catch(e){
        totalSegments = 1
      }
    }

    var segmentNumber = ndn.DataUtils.bigEndianToUnsignedInt(data.name.get(-1).getValue().buf());
    contentArray[segmentNumber] = data.content;
    segmentsRetrieved++;
    if (segmentsRetrieved === totalSegments){
      callback(null, contentArray);
    }

  }

  this.io.fetchAllSegments(this.masterInterest, onEachData, callback );
};



module.exports = Fetcher;
