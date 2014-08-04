var io = {}
  , telehashTransport = require('ndn-telehash-transport')

//io.worker = new Worker("./lib/ndn-io-worker.js");


io.outstandingFetches = [];
io.outstandingMakes = []
io.outstandingNextHops = []
io.outstandingMakeFaces = {}
io.executeTangleCallback;
io.executeHashNameCallback;
io.outstandingPublish = {}
io.activeListeners = {}

io.localTangle = function(port, cb){
  io.worker.postMessage({command: "tangle", transport: "local"}, [port]);
  io.executeTangleCallback = cb
}

io.remoteTangle = function(opts, cb){
  console.log("remote tangle host: ", opts.host, " port: ", opts.port)
  io.worker.postMessage({command: "tangle", transport: "websocket", host: opts.host || location.host.split(":")[0], port: opts.port || 6565})
  io.executeTangleCallback = cb
}

io.makeFace = function(opts, cb){
  io.outstandingMakeFaces[opts.hashname || opts.host] = cb
  io.worker.postMessage({command: "makeFace", opts: opts})

}

io.addNextHop = function(opts, cb){
  io.outstandingNextHops.push({uri: opts.uri, faceID: opts.faceID, callback: cb})
  io.worker.postMessage({command: "addNextHop", opts: opts})
}

io.addListener = function(opts, cb){
  io.activeListeners[opts.uri] = cb
  io.worker.postMessage({command: "listen", opts: opts})

}

io.telehashTangle = function(opts, cb){
  var ms = new MessageChannel()
  telehashTransport.start('wiki', function(hn, dos){
    console.log(hn, dos)
    hn.start(opts.hashname, "ndn", {js: 'incoming'}, function(err, packet, chan, cb){
      cb(true)
      if (packet.js == 'ndn'){
        console.log("packet type == ndn ", packet.body, typeof packet.body)
        var data = packet.body.toArrayBuffer()
        console.log(data)
        var buf = new Buffer(packet.body)
        console.log(buf)
        ms.port1.postMessage(buf.buffer)
      } else {

        console.log("got chan to server", chan.hashname, packet.body)
        ms.port1.onmessage = function(e){
          console.log(e)
          chan.send({js: "ndn", body: new Buffer(e.data)})
        }

      }

    })

    io.localTangle(ms.port2, cb)
  })
}

io.importPKI = function(cert, priPem, pubPem) {
  io.worker.postMessage({cert: cert, priPem: priPem, pubPem: pubPem})
}

io.ping = function(opts){
  io.worker.postMessage({command: "ping", opts: opts})
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
  console.log(req.uri)
  io.outstandingFetches.push({uri: req.uri, whenGotten: whenGotten, whenNotGotten: whenNotGotten});
}

io.publish = function(opts, cb){
  console.log('sending publish command')
  io.worker.postMessage({
    "command": "publish",
    "uri": opts.uri,
    "type": opts.type,
    "thing": opts.thing,
    "version": opts.version
  })
  io.outstandingPublish[opts.uri] = cb
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
  } else if (e.data.responseTo == "tangle") {
    io.executeTangleCallback()
  } else if (e.data.responseTo == "makeFace") {
    io.executeMakeFaceCallback(e.data)
  } else if (e.data.responseTo == "addNextHop") {
    io.executeNextHopCallback(e.data)
  } else if (e.data.responseTo == "listen") {
    io.executeListenCallback(e.data)
  }

}

io.executeListenCallback = function(data) {
  io.activeListeners[data.opts.uri](data.opts, data.interest)
}

io.executeNextHopCallback = function(data){
  var mtch
  for (var i = io.outstandingNextHops.length - 1; i >= 0; i--){
    if ((io.outstandingNextHops[i].uri == data.uri) && (io.outstandingNextHops[i].faceID == data.faceID)) {
      console.log('matched outstanding nextHop')
      mtch = io.outstandingNextHops.splice(i,1)[0]
    }
  }
  mtch.callback(data.success)
}

io.executeMakeFaceCallback = function(data){
  io.outstandingMakeFaces[data.opts.hashname || data.opts.host](data.opts, data.success)
}

io.executePublishCallback = function(data){

  io.outstandingPublish[data.uri](data.success)
}

io.executeEncodedDataCallback = function(data) {
  for (var i = 0; i < io.outstandingMakes.length; i++) {
    if (io.outstandingMakes[i].id == data.id){
      io.outstandingMakes[i].callback(data.encoded)
    }
  }
}

io.executeFetchCallback = function(response) {
  var mtchs = [];
  console.log(response, io.outstandingFetches)
  for (var i = io.outstandingFetches.length - 1; i >= 0; i--){
    if (io.outstandingFetches[i].uri == response.uri) {
      console.log('matched outstanding fetch')
      mtchs.push(io.outstandingFetches.splice(i,1)[0])
    }
  }
  console.log(mtchs)
  for (var j = 0 ; j < mtchs.length; j++){
    if (response.success == true){
      mtchs[j].whenGotten(mtchs[j].uri, response.thing, response.uriActual);
    } else {
      mtchs[j].whenNotGotten(mtchs[j].uri);
    }

  }

}

module.exports = io;
