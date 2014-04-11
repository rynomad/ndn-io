var io = {}

io.worker = new Worker('./ndn-io-worker.js');

io.outstandingFetches = [];
io.outstandingMakes = []

io.executeHashNameCallback;

io.localTangle = function(port){
  io.worker.postMessage({transport: "local"}, [port]);
}

io.remoteTangle = function(opts){
  io.worker.postMessage({transport: "ws", host: opts.host, port: opts.port})
}

io.importPKI = function(cert, priPem, pubPem) {
  io.worker.postMessage({cert: cert, priPem: priPem, pubPem: pubPem})
}

io.getHashName = function(callback){
  executeHashNameCallback = callback
  io.worker.postMessage({command: "getHashName"})
}

io.fetch = function(req, whenGotten, whenNotGotten) {
  io.worker.postMessage({
    "command": "fetch",
    "uri": req.uri,
    "type": req.type,
    "version": req.version,
    "selectors": req.selectors
  });
  io.outstandingFetches.push({uri: req.uri, whenGotten: whenGotten, whenNotGotten: whenNotGotten});
}

io.publish = function(opts){
  console.log('sending publish command')
  io.worker.postMessage({
    "command": "publish",
    "uri": opts.uri,
    "type": opts.type,
    "thing": opts.thing,
    "version": opts.version
  })
}

io.mirror = function(uri){
  io.worker.postMessage({
    "command": "mirror",
    "uri": uri
  })
}

io.makeEncodedData = function(uri, bytes, callback){
  io.outstandingMakes.push({id: bytes.toString(), callback: callback})
  io.worker.postMessage({command: "makeEncoded", uri: uri, bytes: bytes, id: bytes.toString()})
}

io.worker.onmessage = function (e) {
  if (e.data.responseTo == "fetch") {
    io.executeFetchCallback(e.data);
  } else if (e.data.responseTo == "publish") {
    io.executePublishCallback(e.data);
  } else if (e.data.responseTo == "makeEncoded") {
    io.executeEncodedDataCallback(e.data)
  } else if (e.data.responseTo == "getHashName") {
    io.executeHashNameCallback(e.data.hashName)
  }
}

io.executeEncodedDataCallback(data) {
  for (var i = 0; i < io.outstandingMakes.length; i++) {
    if (io.outstandingMakes[i].id == data.id){
      io.outstandingMakes[i].callback(data.encoded)
    }
  }

}

io.executeFetchCallback = function(response) {
  var mtch;
  console.log(response, io.outstandingFetches)
  for (var i = 0; i < io.outstandingFetches.length; i++){
    if (io.outstandingFetches[i].uri == response.uri) {
      console.log('matched outstanding fetch')
      mtch = io.outstandingFetches.splice(i,1)[0]
    }
  }
  console.log(mtch)
  if (response.success == true){
    mtch.whenGotten(mtch.uri, response.thing, response.firstCo);
  } else {
    mtch.whenNotGotten(mtch.uri);
  }

}

module.exports = io;
