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

io.makeFace = function(opts, responder) {

var d, enc, inst, name, onData, onInterest, onTimeout, param;

  console.log("make face'");

  name = new ndn.Name("localhost/nfd/faces/create");

  d = new ndn.Data(new ndn.Name(''), new ndn.SignedInfo(), JSON.stringify(opts));

  d.signedInfo.setFields();

  d.sign();

  enc = d.wireEncode();

  name.append(enc.buffer);

  inst = new ndn.Interest(name);

  onData = function(interest, data){
    console.log("makeFace got Response", data)
    var response = JSON.parse(data.content.toString())
    opts.faceID = response.faceID
    responder(opts, true)
  }

  onTimeout = function(interest) {
    console.log("makeFace timeout", opts.host || opts.hashname)
    responder(opts, false)
  }
  io.face.expressInterest(inst, onData, onTimeout);
}
io.addNextHop = function(opts, cb) {
  var d, enc, inst, name, onData, onInterest, onTimeout, param;

  console.log("registering own face'");

  name = new ndn.Name("localhost/nfd/fib/add-nexthop");

  param = {
    uri: opts.uri
  };
  if (opts.faceID) {
    param.faceID = opts.faceID
  }


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
    if (JSON.parse(data.content.toString()).success === true)  {
      cb(opts, true)
    }
  };

  onTimeout = function(name, interest, something) {
    return console.log('timeout for add nexthop', name, interest, something);
    cb(opts, false)
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
      masterInterest.setInterestLifetimeMilliseconds(opts.selectors.interestLifetime)
    } else {
      masterInterest.setInterestLifetimeMilliseconds(300);
    }
    if (opts.selectors.child == "right")
      masterInterest.setChildSelector(1)
    else if (opts.selectors.child == "left")
      masterInterest.setChildSelector(0)
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
          assembleObject(name);
        } else if (opts.type == "blob" || "file") {
          assembleBlob(name)
        } else {
          assembleBlob(name, opts.type)
        }

    } else {
      if (interestsInFlight < windowSize) {
        for (var i = 0; i < finalSegmentNumber; i++) {
          if ((contentArray[i] == undefined) && (segmentRequested[i] == undefined)) {
            var newInterest = new ndn.Interest(masterInterest)
            newInterest.name.appendSegment(i)
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

  var assembleBlob = function(name, mime) {
    var mime = mime
    var blob = new Blob(contentArray, {type: mime})
    responder(opts.uri, true, blob, firstCo.name.getPrefix(-1).toUri())
  };

  var assembleObject = function(name) {
    var string = "";
    for (var i = 0; i < contentArray.length; i++) {
      string += contentArray[i];
    };
    var obj = JSON.parse(string);
    responder(opts.uri, true, obj, firstCo.name.getPrefix(-1).toUri())
  };



  //console.log(interest.name.toUri())
  if (io.face == undefined){
    io.initBuffer.push({type: "expressInterest", interest: interest, onData: onData, onTimeout: onTimeout})
  } else {

    io.face.expressInterest(interest, onData, onTimeout);
  }


};

io.publishFile = require("./node/publishFile.js")

io.chunkObject = function(opts) {
  var ndnArray = [];
  //console.log(name)
  if (opts.type == 'object') {
    var string = JSON.stringify(opts.thing);
  }
  var name = new ndn.Name(opts.uri)
  if (opts.version != undefined) {
    name.appendVersion(Date.now())
  }
  var stringArray = string.match(/.{1,1300}/g);
  var segmentNames = [];
  for (i = 0; i < stringArray.length; i++) {
    segmentNames[i] = new ndn.Name(name).appendSegment(i)
    var co = new ndn.Data(segmentNames[i], new ndn.SignedInfo(), stringArray[i]);
    co.signedInfo.setFields()
    co.signedInfo.setFinalBlockID(new ndn.Name.Component(utils.initSegment(stringArray.length - 1)))

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
    var command = (new ndn.Name(name)).getPrefix(-2).append(new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])).append(name.getSubName(name.size() - 2));
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
      io.publishFile(opts, responder, ndn, io)
    }
  }
  io.addNextHop(opts, afterNextHopAdded)

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
