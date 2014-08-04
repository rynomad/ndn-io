var ndn;

if (!File){
  function File(){};
  function Blob(){};
}


function Publisher (io, name, toPublish, freshnessPeriod){
  this.contentStore = io.contentStore;

  this.toPublish = toPublish;
  this.name = new ndn.Name(name);
  this.freshnessPeriod = freshnessPeriod || 60 * 60 * 1000;
}

Publisher.installNDN = function(NDN){
  ndn = NDN;
};

Publisher.setFreshnessPeriod = function(milliseconds){
  this.freshnessPeriod = milliseconds;
}

Publisher.prototype.publish = function(callback){
  if ((toPublish instanceof File || Blob || Buffer) || ((typeof toPublish === "string") && (toPublish.indexOf("file://") === 0))){
    this.publishFile(this.toPublish, this.name);
  } else if (typeof toPublish === "string"){
    this.publishString(this.toPublish, this.name);
  } else if (typeof toPublish === "object"){
    this.publishJSON(this.toPublish, this.name);
  }
};

Publisher.prototype.readFile = require("./node/readFile.js");

Publisher.prototype.publishFile = function(file, name){
  var buffer = this.readFile(file)
    , chunks = Match.ceil(buffer.length / 8000)
    , firstData;

  for (var i = 0; i < chunks.length; i++){
    var n = new ndn.Name(name);
    n.appendSegment(i);

    var chunk = buffer.slice(i * 8000, (i + 1) * 8000)
      , d = new ndn.Data(n, new ndn.SignedInfo(), chunk);
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);
    this.contentStore.insert(d.wireEncode().buffer, d);
    if (i === 0){
      firstData = d;
    }
  }

  return firstData;
};

Publisher.prototype.publishJSON = function(json, name, callback){
  this.publishString(JSON.stringify(json), name, callback);
};

Publisher.prototype.publishString = function(string, name, callback){
  var chunks = []
    , datas = [];

  while (string.length > 0){
    chunks.push(string.substr(0,8000));
    string = string.substr(8000, string.length);
  };

  var length = chunks.length;
  for (var i = 0; i < length; i++){
    var n = new ndn.Name(name)
    var d = new ndn.Data(n.appendSegment(i), new ndn.SignedInfo(), chunks.shift());
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);
    d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
    d.sign();
    this.contentStore.insert(d.wireEncode().buffer, d);
  }

  callback(datas);
};

module.exports = Publisher
