var Publisher = require("./Publisher.js"),
    Fetcher = require("./Fetcher.js"),
    contrib = require("ndn-contrib"),
    ndn = contrib.ndn;

Publisher.installContrib(contrib);
Fetcher.installContrib(contrib);

/**
 *@constructor
 *@param {Transport} transportClass a transport class
 *@param {Object} connectionParameters the necessary connection info for the given class
 *@return {io}
 */
function IO (transportClass, connectionParameters, contentStore){
  this.interfaces = new contrib.Interfaces(this);
  this.interfaces.installTransport(transportClass);
  this.interfaces.newFace(transportClass.prototype.name, connectionParameters);
  this.nameTree = (contentStore) ? contentStore.nameTree : new contrib.NameTree();
  this.PIT = new contrib.PIT(this.nameTree);
  this.FIB = new contrib.FIB(this.nameTree);
  this.contentStore = contentStore || new contrib.ContentStore(this.nameTree);
  this.ndn = ndn;
  return this;
}

/** import ndn-contrib into Class scope
 *@static
 *@param {Object} NDN the ndn-contrib object
 */
IO.installContrib = function(contrib){
  Publisher.installContrib(contrib);
  Fetcher.installContrib(contrib);
  ndn = contrib.ndn;
};

IO.localTransport = require("ndn-lib/js/transport/unix-transport.js");

/** Publish a file, json object or string
 *@param {Buffer|Blob|File|FilePath|JSON|String} toPublish the thing you want to publish
 *@param {String|ndn.Name} name the name to publish the data under (excluding segment)
 */
IO.prototype.publish = function(toPublish, name, freshnessMilliseconds){
  this.publisher = this.publisher || new Publisher(this);

  return this.publisher.setToPublish(toPublish)
             .setName(name)
             .setFreshnessPeriod(freshnessMilliseconds)
             .publish(this.announcer);
};

/** Fetche a Blob/Buffer, JSON object, or String
 *@param {String} type a MIME string (eg 'application/javascript') or 'json', 'object', 'string'
 *@param {String} uri the uri of the thing to fetch
 *@param {Function} callback success callback
 *@param {Function} timeout timeout callback
 *@returns {this} for chaining
 */
IO.prototype.fetch = function(type, uri, callback, timeout){
  this.fetcher = this.fetcher || new Fetcher(this);

  this.setName(uri)
      .setInterestLifetimeMilliseconds(4000);

  if (type.split("/").length === 2){
    this.fetcher.getFile(type, callback, timeout);
    return this;
  } else if (type === "object" || "json"){
    this.fetcher.getJSON(callback, timeout);
    return this;
  } else if (type === "string"){
    this.fetcher.getString(callback, timeout);
    return this;
  }

  throw new TypeError("type must be a mimeString, or 'object', 'json', or 'string'");
};

/** settable announce function. Rather than enforce a handshake naming convention/protocol
 * it is up to application developer convention to negotiate storage request handshakes.
 * This function is called within {IO.publish} after the data is in the contentStore
 *@param {Object} firstData the ndn.Data object of the first segment data packet
 */
IO.prototype.announcer = function(firstData){};

/** set the announcer function
  *@param {function} announcer
  *@returns {this} this for chaining
  */
IO.prototype.setAnnouncer = function(announcer){
  this.announcer = announcer;
  return this;
};

/** create an IPC face and a forwarding entry to send interest packets to a listener in the main thread
 *@param {String} prefix the uri of the prefix to listen on
 *@param {Class} connectionParameters to use with IO.localTransport (unix in Node, MessageChannel in browser)
 *@returns {this} this for chaining
 */
IO.prototype.addListener = function(prefix, connectionParameters){

  this.FIB.addEntry(prefix, [{
    faceID: this.Interfaces.newFace(IO.localTransport, connectionParameters)
  }]);
};

/** handler for incoming interests
 *@param {Buffer} element the raw interest packet
 *@param {number} faceID the integer faceID of the receiving face
 */
IO.prototype.handleInterest = function(element, faceID){
  var interest = new ndn.Interest();
  interest.wireDecode(element);
  this.contentStore.check(interest, function(result){
    if (result){
      this.interfaces.dispatch(result, faceID);
    } else {
      var dispatchFlag = this.FIB.findAllNextHops(interest.name.toUri());
      if (dispatchFlag !== 0){
        this.interfaces.dispatch(element, dispatchFlag);
      }
    }
  });
};

/**handler for incoming data
 *@param {Buffer} element the raw data packet
 *@param {number} faceID the integer faceID of the receiving face
 */
IO.prototype.handleData = function(element, faceID){
  var data = new ndn.Data();
  data.wireDecode(element);
  var results = this.PIT.lookup(data);
  for (var i = 0; i < results.pitEntries.length; i++){
    results.pitEntries[i].callback(element, data, data.signedInfo.finalBlockID);
  }
};

/** fetch all segments of any data, excecuting the callback with each packet
 *@param {Interest} firstSegmentInterest the interest for the first segment of a data item
 *@param {function} onEachData function to call with each incoming data packet, recieves the raw packet, the ndn.Data object, and the finalBlockID of the item
 *@param {function} onTimeout function to call if the entire object can't be retrieved, passed the firstSegmentInterest as the only argument
 */
IO.prototype.fetchAllSegments = function(firstSegmentInterest, onEachData, onTimeout){
  var interestsInFlight = 0
    , windowSize = 4
    , masterInterest = new ndn.Interest(firstSegmentInterest)
    , finalSegmentNumber
    , interest = new ndn.Interest(masterInterest)
    , timeoutTriggered = false
    , segmentRequested = []
    , Self = this;

  masterInterest.name = firstSegmentInterest.name.getPrefix(-1);

  var callback = function(element, data, finalBlockID) {
    //console.log("callback")
    if (!element){
      var interest = data;
      var seg = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.get(-1).getValue().buf());
      if (segmentRequested[seg] < 4) {
        segmentRequested[seg]++;
        var packet = interest.wireEncode().buffer;
        Self.PIT.insertPitEntry(packet, interest, callback);
        Self.interfaces.dispatch(packet, 1);
      } else if ((timeoutTriggered === false)) {
        timeoutTriggered = true;
        onTimeout(firstSegmentInterest);
      }
    } else {
      //console.log("element returned", data.name.toUri(), finalBlockID)
      onEachData(element, data, finalBlockID);

      interestsInFlight--;

      var segmentNumber =  ndn.DataUtils.bigEndianToUnsignedInt(data.name.get(-1).getValue().buf());

      finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(finalBlockID);
      //console.log("finalSegmentNumber", finalSegmentNumber);

      if (interestsInFlight < windowSize) {
        var p;
        for (var i = 0; i < finalSegmentNumber; i++) {
          if (segmentRequested[i] === undefined) {

            var newInterest = new ndn.Interest(masterInterest);

            newInterest.name.appendSegment(i);
            //console.log("times",masterInterest.interestLifetime, newInterest.interestLifetime)
            newInterest.setInterestLifetimeMilliseconds(masterInterest.getInterestLifetimeMilliseconds());
            p = newInterest.wireEncode();
            segmentRequested[i] = 0;
            Self.PIT.insertPitEntry(p, newInterest, callback);
            Self.interfaces.dispatch(p, 1);


            interestsInFlight++;
            if (interestsInFlight === windowSize) {
              i = finalSegmentNumber;
            }
          }
        }
      }
    }
  };

  segmentRequested[0] = 0;
  var packet = firstSegmentInterest.wireEncode().buffer;
  firstSegmentInterest = new ndn.Interest();
  firstSegmentInterest.wireDecode(packet);
  this.PIT.insertPitEntry(packet, firstSegmentInterest, callback);
  this.interfaces.dispatch(packet, 1);
  //console.log("dispatched");
};

module.exports = IO;
