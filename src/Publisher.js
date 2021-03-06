var ndn
  , contrib
  , debug = require("debug")("Publisher");

if (!File){
  var File = function File(){}
    , Blob = function Blob(){};
}

/** Publisher object
 *@constructor
 *@param {IO} io the IO instance
 *@param {String=} name the uri to publish the object as
 *@param {File|Blob|Buffer|FilePath|String|Object=} toPublish the thing to publish
 *@param {Number=} freshnessPeriod the freshnessPeriod of the published data in milliseconds (default 1 hour)
 *@returns {Publisher}
 */
function Publisher (io, name, toPublish, freshnessPeriod){
  debug("constructor");
  this.contentStore = io.contentStore;
  this.toPublish = toPublish || null;
  this.name = (name) ? new ndn.Name(name) : null;
  this.freshnessPeriod = freshnessPeriod || 60 * 60 * 1000;
  return this;
}

/** import ndn-contrib into Class scope
 *@static
 *@param {Object} NDN the ndn-contrib object
 */

Publisher.installContrib = function(contrib){
  contrib = contrib;
  ndn = contrib.ndn;
};

/** set the freshnessPeriod of data to publish
 *@param {Number} milliseconds freshness period of published packets
 *@returns {this} for chaining
 */
Publisher.prototype.setFreshnessPeriod = function(milliseconds){
  debug("set freshness milliseconds to %s", milliseconds);
  this.freshnessPeriod = milliseconds;
  return this;
};

/** set the thing to publish
 *@oaram {File|Blob|Buffer|FilePath|String|Object} toPublish the thing to publish
 *@returns {this} this for chaining
 */
Publisher.prototype.setToPublish = function(toPublish){
  var er;

  if (typeof toPublish !== "string") {
    debug("toPublish not a string");
    if (!(toPublish instanceof File
          || (toPublish instanceof Blob)
          || (toPublish instanceof Buffer)
          || (toPublish instanceof Object)
         )){
      er = true;
    } else if (toPublish instanceof Object){
      try{
        JSON.stringify(toPublish);
      } catch (e){
        er = e;
      }
    }
    if (er) {
      throw new TypeError("toPublish must be File, Blob, Buffer, FilePath, String, or parsable JSON");
    }
  }

  this.toPublish = toPublish;
  return this;
};

/** set the name to publish
 *@oaram {String} name the uri to publish as
 *@returns {this} this for chaining
 */
Publisher.prototype.setName = function(name){
  this.name = new ndn.Name(name);
  debug("set Name", this.name.toUri());
  return this;
};

/** publish the data
 *@param {Function=} callback
 *@returns {this} this for chaining
 */
Publisher.prototype.publish = function(callback){
  callback = callback || function(){};
  if (((this.toPublish.type && this.toPublish.size && this.toPublish.name)
       || (this.toPublish instanceof Blob)
       || (Buffer.isBuffer(this.toPublish)))
      || ((typeof this.toPublish === "string")
          && (this.toPublish.indexOf("file://") === 0))){
    this.publishFile(callback);
  } else if (typeof this.toPublish === "string"){
    callback(this.publishString());
  } else if (typeof this.toPublish === "object"){
    callback(this.publishJSON());
  }
  return this;
};

/** read a file, Buffer, Blob, or Filepath into a buffer
 *@private
 *@param {File|Blob|Buffer|FilePath} file a handle to the file/blob/buffer
 *@returns {Buffer}
 */
Publisher.prototype.readFile = require("./node/readFile.js");

/** read, chunk, name, sign, encode, insert into contentStore
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishFile = function(callback){
  debug("publishfile called for %s", this.name.toUri());
  var Self = this;
  var name = Self.name;

  this.readFile(this.toPublish, function(buffer){
    debug("file read to buffer");
    var length = Math.ceil(buffer.length / 8000)
    , firstData;

    for (var i = 0; i < length; i++){
      var n = new ndn.Name(name);
      n.appendSegment(i);

      var chunk = buffer.slice(i * 8000, (i + 1) * 8000)
        , d = new ndn.Data(n, new ndn.SignedInfo(), chunk);
      d.signedInfo.setFreshnessPeriod(Self.freshnessPeriod);
      if (length > 1){
        d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
      } else {
        d.signedInfo.setFinalBlockID(n.get(-1));
      }
      debug("inserting %s into contentStore", d.name.toUri());
      Self.contentStore.insert(d.wireEncode().buffer, d);
      if (i === 0){
        firstData = d;
      }
    }
    callback(firstData);
  });
};

/** stringify and call Pubisher.publishString
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishJSON = function(){
  debug("publishJSON %s", this.name.toUri());
  return this.setToPublish(JSON.stringify(this.toPublish))
             .publishString();

};

/** chunk, name, sign, encode, insert into contentStore
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishString = function(){
  var chunks = []
    , firstData;

  debug("publishString %", this.name.toUri());
  while (this.toPublish.length > 0){
    chunks.push(this.toPublish.substr(0,8000));
    this.toPublish = this.toPublish.substr(8000, this.toPublish.length);
  }

  var length = chunks.length;
  for (var i = 0; i < length; i++){
    var n = new ndn.Name(this.name);
    var d = new ndn.Data(n.appendSegment(i), new ndn.SignedInfo(), chunks.shift());
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);
    if (length === 0){
      d.signedInfo.setFinalBlockID(n.get(-1));
    } else{
      d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
    }
    d.sign();
    debug("inserting %s into contentStore", d.name.toUri());
    this.contentStore.insert(d.wireEncode().buffer, d);
    if (i === 0){
      firstData = d;
    }
  }

  return firstData;
};

module.exports = Publisher;
