var io = require('../../browser.js')
var ndn = require('ndn-lib')
var utils = require('ndn-utils')
var chanTrans = require('ndn-messageChannelTransport').transport
  , RegisteredPrefix = function RegisteredPrefix(prefix, closure) {  this.prefix = new ndn.Name(prefix);    this.closure = closure}
  , ms = new MessageChannel()
  , transport = new chanTrans(ms.port2)
  , face = new ndn.Face({host:1,port:1, getTransport: function(){return transport}})

face.transport.connect(face, function(){console.log('connected')})

function onInterest (prefix,interest,transport){
  console.log("got interest", prefix)
  var d = new ndn.Data(new ndn.Name(interest.name.toUri()), new ndn.SignedInfo(), "success")
  d.signedInfo.setFinalBlockID(new ndn.Name.Component([0x14]))
  d.signedInfo.setFields()
  var encoded = d.wireEncode()
  console.log("sending encoded", encoded)
  transport.send(encoded.buffer)
}

closure = new ndn.Face.CallbackClosure(null, null, onInterest, 'test', face.transport)
ndn.Face.registeredPrefixTable.push(new RegisteredPrefix('test', closure))


describe('Setup', function(){
  describe('should tangle', function(){
    it('with websocket', function(done) {
      function cb (){done()}
      io.remoteTangle({host: "rosewiki.org", port:9696}, cb)

    })
    
    it('with messageChannel', function(done){
      this.timeout(10000)
      function cb (){ done()}
      io.localTangle(ms.port1, cb)
    })
  })
})

describe('fetch', function(){
  it('should pipeline fetch 20 segments', function(done){
    function onData(data, transport, thing){
      console.log(data, transport, thing)
      done()
    }
    function onTimeout(){
      console.log('fail')
    }
    io.fetch({uri: "test/text/text/name", type: 'blob'}, onData, onTimeout)
  })
})

