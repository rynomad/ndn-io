/*
self.window = "";

var channelTransport = require('ndn-message-channel-transport')
  , io = require("./ndn-io.js");

var fetchResponder = function(uri, success, thingOrObj, firstCoUri) {
  if (success === true) {
    self.postMessage({responseTo: "fetch", success: true, uri: uri, thing: thingOrObj, uriActual: firstCoUri})
  } else {
    self.postMessage({responseTo: "fetch", success: false, uri: uri});
  }
}

var publishResponder = function(uri, success) {
  self.postMessage({responseTo: "publish", success: success, uri: uri})
}

var makeFaceResponder = function(opts, success){
  self.postMessage({responseTo: "makeFace", success: success, opts: opts})
}

var nextHopResponder = function(opts, success){
  self.postMessage({responseTo: "addNextHop", success: success, uri: opts.uri, faceID: opts.faceID})
}

var listenResponder = function(opts, interest) {
  self.postMessage({responseTo: "listen", opts: opts, interest: interest})
}

onmessage = function(e){
  console.log(e.data)
  if (e.data.cert){
    io.importPKI(e.data.cert,  e.data.priPem, e.data.pubPem)
  } else if (e.data.command) {
    if (e.data.command == "makeFace"){
      io.makeFace(e.data.opts, makeFaceResponder)
    } else if (e.data.command == "addNextHop") {
      io.addNextHop(e.data.opts, listenResponder)
    } else if (e.data.command == "fetch") {
      io.fetch(e.data, fetchResponder)
    } else if (e.data.command == "publish") {
      io.publish(e.data, publishResponder)
    } else if (e.data.command == "listen") {
      io.addListener(e.data, listenResponder)
    } else if (e.data.command == "ping") {
      io.ping(e.data.opts)
    } else if (e.data.command == "makeEncoded"){
      io.makeEncoded(e.data, function(id, encoded) {self.postMessage({responseTo: "makeEncoded", id: id, encoded: encoded})})
    } else if (e.data.command == "getHashName") {
      self.postMessage({
        responseTo: "getHashName",
        hashName: io.getHashname()
      })
    } else if (e.data.command == "tangle") {
      function ack() {
        self.postMessage({
          responseTo: "tangle",
          success: true
        })
      }
      if (e.data.transport == "local"){
        console.log("tangling with local transport", e)
        io.initFace(channelTransport, e.ports[0], ack)
      } else if (e.data.transport == "websocket"){
        io.initFace("websocket", {host: e.data.host, port: e.data.port}, ack)
      } else if (e.data.transport == "telehash") {
        io.initFace("telehash", {hashname: e.data.hashname}, ack)
      }
    }

  }
}




*/
