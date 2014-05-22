var io = {}
  , telehashTransport = require('ndn-telehash-transport')


io.worker = new Worker("./lib/ndn-io-worker.js");


io.outstandingFetches = [];
io.outstandingMakes = []
io.executeTangleCallback;
io.executeHashNameCallback;
io.outstandingPublish = {}

io.localTangle = function(port, cb){
  io.worker.postMessage({command: "tangle", transport: "local"}, [port]);
  io.executeTangleCallback = cb
}

io.remoteTangle = function(opts, cb){
  console.log("remote tangle host: ", opts.host, " port: ", opts.port)
  io.worker.postMessage({command: "tangle", transport: "websocket", host: opts.host || location.host.split(":")[0], port: opts.port || 6565})
  io.executeTangleCallback = cb
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
  }
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
  var mtch;
  console.log(response, io.outstandingFetches)
  for (var i = io.outstandingFetches.length - 1; i >= 0; i--){
    if (io.outstandingFetches[i].uri == response.uri) {
      console.log('matched outstanding fetch')
      mtch = io.outstandingFetches.splice(i,1)[0]
    }
  }
  console.log(mtch)
  if (response.success == true){
    mtch.whenGotten(mtch.uri, response.thing, response.uriActual);
  } else {
    mtch.whenNotGotten(mtch.uri);
  }

}

module.exports = io;
