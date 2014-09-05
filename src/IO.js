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


  var transports = Object.keys(contrib.Transports);

  for (var i = 0; i < transports.length; i++){
    this.interfaces.installTransport(contrib.Transports[transports[i]]);
  }

  this.interfaces.newFace(transportClass, connectionParameters);
  this.nameTree = (contentStore) ? contentStore.nameTree : new contrib.NameTree();
  this.PIT = new contrib.PIT(this.nameTree);
  this.FIB = new contrib.FIB(this.nameTree);
  this.contentStore = contentStore || new contrib.ContentStore(this.nameTree);
  this.ndn = ndn;
  this.publisher = new Publisher(this);
  this.fetcher = new Fetcher(this);
  return this;
}

IO.ndn = ndn;

/** import ndn-contrib into Class scope
 *@static
 *@param {Object} NDN the ndn-contrib object
 */
IO.installContrib = function(contrib){
  Publisher.installContrib(contrib);
  Fetcher.installContrib(contrib);
  ndn = contrib.ndn;
  this.ndn = contrib.ndn;
  console.log("contrib installed")
};

IO.localTransport = require("ndn-lib/js/transport/unix-transport.js");

/** Publish a file, json object or string
 *@param {Buffer|Blob|File|FilePath|JSON|String} toPublish the thing you want to publish
 *@param {String|ndn.Name} name the name to publish the data under (excluding segment)
 */
IO.prototype.publish = function(name, toPublish, announcer ){
  this.publisher = this.publisher || new Publisher(this);

  return this.publisher.setToPublish(toPublish)
             .setName(name)
             .setFreshnessPeriod( 60 * 60 * 1000)
             .publish(announcer);
};

/** Fetch a Blob/Buffer, JSON object, or String
 *@param {String} type a MIME string (eg 'application/javascript') or 'json', 'object', 'string'
 *@param {String} uri the uri of the thing to fetch
 *@param {Function} callback success callback
 *@param {Function} timeout timeout callback
 *@returns {this} for chaining
 */
IO.prototype.fetch = function(uriString, callback){
  this.fetcher = this.fetcher || new Fetcher(this);

  var parts = uriString.split("://")
  //console.log("parts", parts)


  this.fetcher.setName(parts[1])
              .setInterestLifetimeMilliseconds(400)
              .setType(parts[0])
              .get(callback);

  return this;
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
  //console.log("IO module got interest",interest.name.toUri())
  var Self = this;
  this.contentStore.check(interest, function(result){
    //console.log("got result?", interest.name.toUri(), result)
    if (result){
      Self.interfaces.dispatch(result, 0 | (1 << faceID));
    } /*else {
      var dispatchFlag = this.FIB.findAllNextHops(interest.name.toUri());
      if (dispatchFlag !== 0){
        Self.interfaces.dispatch(element, dispatchFlag);
      }
    } */
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
    , windowSize = 50
    , masterInterest = new ndn.Interest(firstSegmentInterest)
    , finalSegmentNumber
    , interest = new ndn.Interest(masterInterest)
    , callbackTriggered = false
    , segmentRequested = []
    , segmentGot = []
    , Self = this;

  masterInterest.name = firstSegmentInterest.name.getPrefix(-1);

  var callback = function(element, data, finalBlockID) {
    //console.log("callback")
    if (!element){
      var interest = data;
      var seg = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.get(-1).getValue().buf());
      if (!segmentGot[seg]){
        if (segmentRequested[seg] < 6) {
          segmentRequested[seg]++;
          var packet = interest.wireEncode().buffer;
          Self.PIT.insertPitEntry(packet, interest, callback);
          Self.interfaces.dispatch(packet, 1);
        } else if ((callbackTriggered === false)) {
          callbackTriggered = true;
          onTimeout(new Error("fetching data failed due to timeout: ", firstSegmentInterest.toUri()), null);
        }
      }
    } else {
      //console.log("element returned", data.name.toUri(), finalBlockID)
      finalBlockID = finalBlockID || firstSegmentInterest.name.get(-1);
      onEachData(element, data, finalBlockID);

      interestsInFlight--;

      var segmentNumber =  ndn.DataUtils.bigEndianToUnsignedInt(data.name.get(-1).getValueAsBuffer());
      segmentGot[segmentNumber] = true;

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
