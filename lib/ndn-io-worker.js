self.window = ""

var channelTransport = require('ndn-messageChannelTransport');
  , io = require("./ndn-io.js");

var fetchResponder = function(uri, success, thingOrObj, firstCo) {
  if (success == true) {
    self.postMessage({responseTo: "fetch", success: true, uri: uri, thing: thingOrObj, firstCo: firstCo})
  } else {
    self.postMessage({responseTo: "fetch", success: false, uri: uri});
  }
}

onmessage = function(e){
  if (e.data.port) {
    if (e.data.port == "daemonPort") {
      io.initFace(channelTransport, e.ports[0])
    }
  } else if (e.data.cert){
    io.importPKI(e.data.cert,  e.data.priPem, e.data.pubPem)
  } else if (e.data.command) {
    if (e.data.command == "fetch") {
      io.fetch(e.data, fetchResponder)
    } else if (e.data.command == "publish") {
      io.publish(e.data)
    } else if (e.data.command == "mirror") {    
      io.mirror(e.data.uri)
    } else if (e.data.command == "makeEncoded"){
      io.makeEncoded(e.data, function(id, encoded) {self.postMessage({responseTo: "makeEncoded", id: id, encoded: encoded})})
    } else if (e.data.command == "getHashName") {
      self.postMessage({
        responseTo: "getHashName",
        hashName: io.getHashname()
      })
    }

  }
}




