var ndn;

if (!File){
  var File = function File(){}
    , Blob = function Blob(){};
}

/** Publisher object for files
 *@constructor
 *@param {IO} io the IO instance
 *@param {String} name the uri to publish the object as
 *@param {File|Blob|Buffer|FilePath|String|Object} toPublish the thing to publish
 *@param {Number} freshnessPeriod the freshnessPeriod of the published data in milliseconds (default 1 hour)
 *@returns {Publisher}
 */
function Publisher (io, name, toPublish, freshnessPeriod){
  this.contentStore = io.contentStore;
  this.toPublish = toPublish || null;
  this.name = (name) ? new ndn.Name(name) : null;
  this.freshnessPeriod = freshnessPeriod || 60 * 60 * 1000;
  return this;
}

/** import ndn-lib into Class scope
 *@static
 *@param {Object} NDN the ndn-lib object
 */

Publisher.installNDN = function(NDN){
  ndn = NDN;
};

/** set the freshnessPeriod of data to publish
 *@param {Number} milliseconds freshness period of published packets
 *@returns {this} for chaining
 */
Publisher.setFreshnessPeriod = function(milliseconds){
  this.freshnessPeriod = milliseconds;
  return this;
};

/** set the thing to publish
 *@oaram {File|Blob|Buffer|FilePath|String|Object} toPublish the thing to publish
 *@returns {this} this for chaining
 */
Publisher.setToPublish = function(toPublish){
  this.toPublish = toPublish;
  return this;
};

/** set the name to publish
 *@oaram {String} name the uri to publish as
 *@returns {this} this for chaining
 */
Publisher.setName = function(name){
  this.name = new ndn.Name(name);
  return this;
};

/** publish the data
 *@param {Function=} callback
 *@returns {this} this for chaining
 */
Publisher.prototype.publish = function(callback){
  callback = callback || function(){};
  if ((this.toPublish instanceof File || Blob || Buffer) || ((typeof this.toPublish === "string") && (this.toPublish.indexOf("file://") === 0))){
    callback(this.publishFile(this.toPublish, this.name));
  } else if (typeof this.toPublish === "string"){
    callback(this.publishString(this.toPublish, this.name));
  } else if (typeof this.toPublish === "object"){
    callback(this.publishJSON(this.toPublish, this.name));
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
Publisher.prototype.publishFile = function(){
  var buffer = this.readFile(this.toPublish)
    , length = Math.ceil(buffer.length / 8000)
    , firstData;

  for (var i = 0; i < length; i++){
    var n = new ndn.Name(this.name);
    n.appendSegment(i);

    var chunk = buffer.slice(i * 8000, (i + 1) * 8000)
      , d = new ndn.Data(n, new ndn.SignedInfo(), chunk);
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);

    d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
    this.contentStore.insert(d.wireEncode().buffer, d);
    if (i === 0){
      firstData = d;
    }
  }

  return firstData;
};

/** stringify and call Pubisher.publishString
 *@private
 *@returns {Object} firstData the ndn.Data packet of the first content Object, signed and marked with final
 */
Publisher.prototype.publishJSON = function(){
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

  while (this.toPublish.length > 0){
    chunks.push(this.toPublish.substr(0,8000));
    this.toPublish = this.toPublish.substr(8000, this.toPublish.length);
  }

  var length = chunks.length;
  for (var i = 0; i < length; i++){
    var n = new ndn.Name(name);
    var d = new ndn.Data(n.appendSegment(i), new ndn.SignedInfo(), chunks.shift());
    d.signedInfo.setFreshnessPeriod(this.freshnessPeriod);
    d.signedInfo.setFinalBlockID(new ndn.Name.Component(ndn.DataUtils.nonNegativeIntToBigEndian(length - 1)));
    d.sign();
    this.contentStore.insert(d.wireEncode().buffer, d);
    if (i === 0){
      firstData = d;
    }
  }

  return firstData;
};

module.exports = Publisher;
