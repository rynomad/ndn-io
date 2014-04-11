var io = require('../../browser.js')
window.ndn = require('ndn-lib')

var chanTrans = require('ndn-messageChannelTransport').transport
  , RegisteredPrefix = function RegisteredPrefix(prefix, closure) {  this.prefix = new ndn.Name(prefix);    this.closure = closure}
  , ms = new MessageChannel()
  , transport = new chanTrans(ms.port2)
  , face = new ndn.Face({host:1,port:1, getTransport: function(){return transport}})

face.transport.connect(face, function(){console.log('connected')})

function onInterest (prefix,interest,transport){
  console.log("got interest", prefix)
  var d = new ndn.Data(new ndn.Name(interest.name.toUri()), new ndn.SignedInfo(), "success")
  d.signedInfo.setFinalBlockID(new ndn.Name.Component([0x00]))
  d.signedInfo.setFields()
  window.gotInterest = true
  var encoded = d.wireEncode()
  console.log("sending encoded", encoded)
  transport.send(encoded.buffer)
}

closure = new ndn.Face.CallbackClosure(null, null, onInterest, 'test', face.transport)
ndn.Face.registeredPrefixTable.push(new RegisteredPrefix('test', closure))


describe('Setup', function(){
  describe('should tangle', function(){
    
    it('with messageChannel', function(done){
      this.timeout(10000)
      function cb (){ done()}
      io.localTangle(ms.port1, cb)
    })
    it('with websocket', function(done) {
      function cb (){done()}
      io.remoteTangle({host: "rosewiki.org", port:9696}, cb)
   
    })
  })
})
/**
describe('Storage Interface', function(){
  it('should respond to write request with dummy data', function(done){
    var command = new ndn.Name.Component([0xc1, 0x2e, 0x52, 0x2e, 0x73, 0x77])
    var na = new ndn.Name('test')
    na.append(command)
    var interest = new ndn.Interest(na)
    interest.setInterestLifetimeMilliseconds(1000)
    function onData(interest, data){
      if (data.content.toString() == "content storage request recieved")
      {done()}
    }
    function onTimeout(interest, something){
      console.log('fail')
    }
    face.expressInterest(interest, onData, onTimeout)
  })
  it('should send an Interest to fetch the data', function(done){
  this.timeout(10000)
  function check(){
    if (window.gotInterest != true){
      setTimeout(check, 100)
    } else {
      done()
    }
  }
  check()
  })
  it('should respond to Interest with data', function(done){
    this.timeout(10000)
    var n = new ndn.Name("test")
    var inst = new ndn.Interest(n)
    inst.setInterestLifetimeMilliseconds(1000)
    function onData(interest, data){
      if (data.content.toString() == "success"){
        done()
      }
    }
    function onTimeout(interest, something){
      console.log('fail')
    }
    face.expressInterest(inst, onData, onTimeout)
  })
})
**/
