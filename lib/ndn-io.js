var io = {}
  , ndn = require("ndn-lib")
  , utils = require('ndn-utils')
  , messageChannelTransport = require("ndn-message-channel-transport")
  , self

io.initBuffer = []
var keyManager = function() {

  this.certificate = null
  this.publicKey = null
  this.privateKey = null

  this.key = null;
};
keyManager.prototype.getKey = function()
{
  if (this.key === null) {
    this.key = new ndn.Key();
    this.key.fromPemString(this.publicKey, this.privateKey);
  }

  return this.key;
}

ndn.globalKeyMangager =  new keyManager()

io.remoteTangle = function(){}

io.useNDN = function(n){
  ndn = n
}

io.initFace = function(transportClass, portStreamOrWebSocket, ack){
  console.log(transportClass, portStreamOrWebSocket, ack)
  if ((typeof transportClass == "string") && (transportClass == "websocket" || "tcp")){
    io.face = new ndn.Face({host:portStreamOrWebSocket.host, port: portStreamOrWebSocket.port})
  } else {
    console.log("local local")
    io.face = new ndn.Face({host:1337, port:1337, getTransport:function(){return new messageChannelTransport.transport(portStreamOrWebSocket)}})
  }
  io.face.transport.connect(io.face, function(){
    console.log("io face connected")
    if (io.initBuffer.length > 0){
      for (var i = 0; i < io.initBuffer.length; i++){
        var action = io.initBuffer[i]
        if (action.type = "expressInterest")
          io.face.expressInterest(action.interest, action.onData, action.onTimeout)
      }
    }
    ack()
  })
}

io.telehashTangle = function(opts){

  io.initFace(null, opts.hashname, function(){})

}

io.importPKI = function(cert, priPem, pubPem) {
  ndn.globalKeyManager.certificate = cert
  ndn.globalKeyManager.publicKey = pubPem
  ndn.globalKeyManager.privateKey = priPem
}

io.getHashname = function() {
  return ndn.globalKeyManager.getKey().publicKeyDigest.toString('hex');
}

io.addNextHop = function(uri, cb) {
  var d, enc, inst, name, onData, onInterest, onTimeout, param;

  console.log("registering own face'");

  name = new ndn.Name("localhost/nfd/fib/add-nexthop");

  param = {
    uri: uri
  };


  console.log("nexthop uri:", param.uri);

  d = new ndn.Data(new ndn.Name(''), new ndn.SignedInfo(), JSON.stringify(param));

  d.signedInfo.setFields();

  d.sign();

  enc = d.wireEncode();

  name.append(enc.buffer);

  inst = new ndn.Interest(name);

  onData = function(interest, data, something) {
    var registeredPrefix;
    console.log("got data from io.addNextHop", data)
    if (data.content.toString() === "success")  {
      cb()
    }
  };

  onTimeout = function(name, interest, something) {
    return console.log('timeout for add nexthop', name, interest, something);
  };

  io.face.expressInterest(inst, onData, onTimeout);

}

io.mirror = function(uri){
    var onTimeout = function (interest) {
      console.log("timeout", interest);
    };
    var onData = function(data) {
      console.log(data)
    };
    //console.log(name.toUri())
    var command = new ndn.Name(uri)
    command.append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]))
    var interest = new ndn.Interest(command)
    interest.interestLifetime = 4000
    utils.setNonce(interest)
    //console.log("did this time correctly?", command.toUri())
    io.face.expressInterest(interest, onData, onTimeout);
}

io.makeEncoded = function(data, responder) {
  var d = new ndn.Data(new ndn.Name(data.uri), new ndn.SignedInfo(), data.bytes)
  d.signedInfo.setFields()
  d.sign()
  var encoded = d.encode()
  responder(data.id, encoded)

}
io.fetch = function(opts, responder) {
  console.log(opts)
  var returnName;
  var interestsInFlight = 0;
  var windowSize = 4;
  var t0 = new Date().getTime()
  var segmentRequested = [];
  var whenNotGottenTriggered = false

  var name = new ndn.Name(opts.uri)



  var contentArray = [];

  var recievedSegments = 0;

  segmentRequested[interestsInFlight] = 0;

  var masterInterest = new ndn.Interest(name)


  if (opts.selectors != undefined) {
    if (opts.selectors.publisherPublicKeyDigest != undefined) {
      masterInterest.publisherPublicKeyDigest = new ndn.PublisherPublicKeyDigest(opts.selectors.publisherPublicKeyDigest);
    }
    if (opts.selectors.exclude != undefined) {
      var comps = []
      for (var i = 0; i < opts.selectors.exclude.length; i++) {
        comps[i] = new ndn.Name.Component(opts.selectors.exclude[i])
      }
      masterInterest.exclude = new ndn.Exclude(comps)
    }
    if (opts.selectors.interestLifetime != undefined) {
      masterInterest.interestLifetime = opts.selectors.interestLifetime;
    } else {
      masterInterest.interestLifetime = 4000;
    }

  } else {
    masterInterest.setInterestLifetimeMilliseconds(250);
  }

  var interest = new ndn.Interest(masterInterest);

  //console.log(interest.interestLifetime)

  var firstCo;
  var onData = function(interest, co) {
    interestsInFlight--;
    //console.log(interest)

    var segmentNumber = utils.getSegmentInteger(co.name)
    if (segmentNumber == 0) {
      firstCo = co
      returnName = firstCo.name.getPrefix(-1)
    }
    var finalSegmentNumber = 1 + ndn.DataUtils.bigEndianToUnsignedInt(co.signedInfo.finalBlockID);
    //console.log(segmentNumber, co.name.toUri());
    if (contentArray[segmentNumber] == undefined) {
      if (opts.type == 'object') {
        contentArray[segmentNumber] = (ndn.DataUtils.toString(co.content));
      } else if (opts.type == 'blob' || 'file'){
        contentArray[segmentNumber] = co.content;
      }

      recievedSegments++;
    }

    //console.log(recievedSegments, finalSegmentNumber, interestsInFlight);
    if (recievedSegments == finalSegmentNumber) {
        //console.log('got all segment', contentArray.length);
        var t1 = new Date().getTime()
        console.log(t1 - t0)
        if (opts.type == "object") {
          assembleObject(returnName);
        } else if (opts.type == "blob" || "file") {
          assembleBlob(returnName)
        };

    } else {
      if (interestsInFlight < windowSize) {
        for (var i = 0; i < finalSegmentNumber; i++) {
          if ((contentArray[i] == undefined) && (segmentRequested[i] == undefined)) {
            var newInterest = new ndn.Interest(new ndn.Name(co.name.getPrefix(-1).appendSegment(i)))
            newInterest.setInterestLifetimeMilliseconds(250)
            io.face.expressInterest(newInterest, onData, onTimeout)
            segmentRequested[i] = 0;
            interestsInFlight++
            if (interestsInFlight == windowSize) {
              //stop iterating
              i = finalSegmentNumber;
            };
          };
        };
      };
    };
  };
  var onTimeout = function(interest) {
    var seg = utils.getSegmentInteger(interest.name)
    if (segmentRequested[seg] < 4) {
      segmentRequested[seg]++
      var newInterest = new ndn.Interest(interest);
      console.log(masterInterest.interestLifetime)
      newInterest.setInterestLifetimeMilliseconds(masterInterest.interestLifetime)
      io.face.expressInterest(newInterest, onData, onTimeout)

    } else if ((whenNotGottenTriggered == false)) {
      whenNotGottenTriggered = true;
      console.log(segmentRequested)
      responder(opts.uri, false)
    }
  };

  var assembleBlob = function(name) {
    var mime = name.components[2].toEscapedString() + '/' + name.components[3].toEscapedString()
    var blob = new Blob(contentArray, {type: mime})
    responder(name.toUri(), true, blob, firstCo)
  };

  var assembleObject = function(name) {
    var string = "";
    for (var i = 0; i < contentArray.length; i++) {
      string += contentArray[i];
    };
    var obj = JSON.parse(string);
    responder(name.toUri(), true, obj, firstCo)
  };



  //console.log(interest.name.toUri())
  if (io.face == undefined){
    io.initBuffer.push({type: "expressInterest", interest: interest, onData: onData, onTimeout: onTimeout})
  } else {

    io.face.expressInterest(interest, onData, onTimeout);
  }


};

io.publishFile = function(opts) {
  //console.log( opts.thing)
  var chunkSize = 1050,
      fileSize = (opts.thing.size - 1),
      totalSegments = Math.ceil(opts.thing.size / chunkSize),
      name = new ndn.Name(opts.uri)


  function getSlice(file, segment, transport) {
    //console.log(file)
    var fr = new FileReader(),
        chunks = totalSegments,
        start = segment * chunkSize,
        end = start + chunkSize >= file.size ? file.size : start + chunkSize,
        blob = file.slice(start,end);

    fr.onloadend = function(e) {
      var buff = new ndn.ndnbuf(e.target.result),
          segmentName = (new ndn.Name(name)).appendSegment(segment),
          data = new ndn.Data(segmentName, new ndn.SignedInfo(), buff),
          encodedData;

        data.signedInfo.setFields();
        data.signedInfo.finalBlockID = utils.initSegment(totalSegments - 1);
        data.sign();
        encodedData = data.encode();

        transport.send(encodedData);
        var ms = new MessageChannel()
        ms.port1.postMessage(e.target.result, [e.target.result])
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
    //console.log("about to read as array buffer")
    fr.readAsArrayBuffer(blob, (end - start))


  };
  //console.log('y u crashing?')
  function onInterest(prefix, interest, transport) {
    //console.log("onInterest called.", opts);
    if (!utils.endsWithSegmentNumber(interest.name)) {
      interest.name.appendSegment(0);
    };
    var segment = ndn.DataUtils.bigEndianToUnsignedInt(interest.name.components[interest.name.components.length - 1].value);

    getSlice(opts.thing, segment, transport)

  };
  //console.log('when u crashing?')
  function sendWriteCommand() {
    var onTimeout = function (interest) {
      console.log("timeout", interest);
    };
    var onData = function(data) {
      console.log(data)
    };
    //console.log(name.toUri())
    var command = name.getPrefix(- 1).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(utils.getSuffix(name, name.components.length - 1 ))
    var interest = new ndn.Interest(command)
    interest.interestLifetime = 4000
    utils.setNonce(interest)
    //console.log("did this time correctly?", command.toUri())
    io.face.expressInterest(interest, onData, onTimeout);

  };
  var prefix = name
  //console.log(name.toUri())
  var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
  ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
  console.log("publish defined")
  setTimeout(sendWriteCommand, 0)

};
io.chunkObject = function(opts) {
  var ndnArray = [];
  //console.log(name)
  if (opts.type == 'object') {
    var string = JSON.stringify(opts.thing);
  }
  var name = new ndn.Name(opts.uri)
  if (opts.version != undefined) {
    utils.appendVersion(name, opts.version)
  }
  var stringArray = string.match(/.{1,1300}/g);
  var segmentNames = [];
  for (i = 0; i < stringArray.length; i++) {
    segmentNames[i] = new ndn.Name(name).appendSegment(i)
    var co = new ndn.Data(segmentNames[i], new ndn.SignedInfo(), stringArray[i]);
    co.signedInfo.setFields()
    co.signedInfo.finalBlockID = utils.initSegment(stringArray.length - 1)

    if (opts.freshness != undefined) {
      co.signedInfo.setFreshnessPeriod(opts.freshness)
    }
    co.sign()
    ndnArray[i] = co.wireEncode()
  };

  return {array:ndnArray, name: name};

};
io.publishObject = function(opts, responder) {
  var returns = io.chunkObject(opts)
  var name = returns.name
  var ndnArray = returns.array

  var onInterest = function(prefix, interest, transport) {
    var requestedSegment = utils.getSegmentInteger(interest.name)
    console.log("got object interest!!!!", ndnArray[requestedSegment])
    transport.send(ndnArray[requestedSegment].buffer)
  };
  var prefix = name

  function sendWriteCommand() {
    var onTimeout = function (interest) {
      console.log("timeout", interest.toUri());
      responder(opts.uri, false)
    };
    var onData = function(interest, data) {
      console.log("got data in writecommand interest " + interest.name.toUri())
      if (data.content.toString() == "content stored"){
        responder(opts.uri, true)
      }
    };
    var closure = new ndn.Face.CallbackClosure(null, null, onInterest, prefix, io.face.transport);
    ndn.Face.registeredPrefixTable.push(new RegisteredPrefix(prefix, closure));
    console.log("prefix!!!!!!!!!!!!!!!!",prefix.toUri())
    var command = (new ndn.Name(name)).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77]));
    console.log(command)
    var interest = new ndn.Interest(command)
    console.log(interest)
    interest.setInterestLifetimeMilliseconds(1000)
    console.log("did this time correctly?" + interest.name.toUri())
    io.face.expressInterest(interest, onData, onTimeout);

  };
  setTimeout(sendWriteCommand, 0)
};

io.publish = function (opts, responder) {
  console.log(JSON.stringify(opts))
  function afterNextHopAdded(){
    if (opts.type== "object") {
      io.publishObject(opts, responder)
    } else if (opts.type == "file" || "blob" ) {
      io.publishFile(opts, responder)
    }
  }
  io.addNextHop(opts.uri, afterNextHopAdded)

}

function cb() {
  var keyName = new ndn.Name('/%C1.M.S.localhost/%C1.M.SRV/ndnd/KEY')
  var inst = new ndn.Interest(keyName)

}
var RegisteredPrefix = function RegisteredPrefix(prefix, closure)
{
  this.prefix = prefix;        // String
  this.closure = closure;  // Closure
};


module.exports = io;
