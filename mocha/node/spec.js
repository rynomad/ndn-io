var io = require('../../node.js')
var ndn = require('ndn-lib')
var utils = require('ndn-utils')
  , RegisteredPrefix = function RegisteredPrefix(prefix, closure) {  this.prefix = new ndn.Name(prefix);    this.closure = closure}
  , face = new ndn.Face({host:'localhost',port:6464})

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
    it('with repo via tcp', function(done) {
      function cb (){done()}
      io.remoteTangle({host: "localhost", port:6464}, cb)

    })
    it('should fetch', function(done){
      function onData(data, transport, thing){
        console.log(data, transport, thing)
        done()
      }
      function onTimeout(){
        console.log('fail')
      }
      io.fetch({uri: "wiki/page/welcome-visitors", type: 'object'}, onData, onTimeout)
    })
  })
})

describe('in', function(){

})

