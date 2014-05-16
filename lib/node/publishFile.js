var utils = require("ndn-utils")
var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};
var fs = require("fs")
module.exports = function(opts, responder,  ndn, io) {
  ndn.WireFormat.setDefaultWireFormat(new ndn.TlvWireFormat())
  console.log( opts.thing)
  var chunkSize = 1050,

      name = new ndn.Name(opts.uri),
      bufferArray = []

  fs.readFile(opts.thing, function(err, data){
    if (err)
      return console.log(err)

    var totalSegments = Math.ceil(data.length / chunkSize),
        fileSize = (data.length - 1)
    console.log(totalSegments)



    function getSlice(file, segment, transport) {
      var
          chunks = totalSegments,
          start = segment * chunkSize,
          end = start + chunkSize >= file.length ? file.length : start + chunkSize,
          blob = file.slice(start,end),
          segmentName = (new ndn.Name(name)).appendSegment(segment),

          data = new ndn.Data(segmentName, new ndn.SignedInfo(), new ndn.customBuffer(blob)),
          encodedData;
      //console.log("data assigned",segmentName, blob )
      if (opts.freshness != undefined) {
        data.signedInfo.setFreshnessPeriod(opts.freshness)
      }
      data.signedInfo.setFields();
      data.signedInfo.finalBlockID = utils.initSegment(totalSegments - 1);
      data.sign();
      console.log('signed')
      encodedData = data.wireEncode().buffer;
      console.log("data encoded", data.name.toUri())

      transport.send(encodedData);

      //ms.port1.postMessage(buff.buffer, [buff.buffer])
      if (segment == totalSegments -1) {
        //remove closure from registeredPrefixTable
        for (var i = 0; i < ndn.Face.registeredPrefixTable.length; i++) {
          if (ndn.Face.registeredPrefixTable[i].prefix.match(new ndn.Name(name))) {
            ndn.Face.registeredPrefixTable.splice(i,1);
          }
        }
      }


    };
    console.log('y u crashing?')
    function onInterest(prefix, interest, transport) {
      console.log("onInterest called.", opts);
      if (!utils.endsWithSegmentNumber(interest.name)) {
        interest.name.appendSegment(0);
      };
      var segment = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.components[interest.name.components.length - 1].value);

      getSlice(data, segment, transport)

    };
    //console.log('when u crashing?')
    function sendWriteCommand() {
      var onTimeout = function (interest) {
        console.log("timeout", interest);
        responder(opts.uri, false)
      };
      var onData = function(data) {
        console.log("got response to writeCommand for file")
        responder(opts.uri, true)
      };
      //console.log(name.toUri())
      var command = (new ndn.Name(name)).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]));
      var interest = new ndn.Interest(command)
      interest.setInterestLifetimeMilliseconds(4000)
      //console.log("did this time correctly?", command.toUri())
      io.face.expressInterest(interest, onData, onTimeout);

    };
    var prefix = name
    //console.log(name.toUri())
    var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
    ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
    console.log("publish defined")
    setTimeout(sendWriteCommand, 0)
  })
};
