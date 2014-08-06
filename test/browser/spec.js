var IO = require('../../index.js')
  , transportClass = require("ndn-contrib/src/Transports/browser/MessageChannel.js")
  , IO1
  , Interfaces = require("ndn-contrib/src/DataStructures/Interfaces.js");

var dat = []


var ms = new MessageChannel()
IO1 = new IO(transportClass, ms.port1)
var ndn = IO1.ndn;

for (var i = 0 ; i < 100; i++){
  var n = new ndn.Name("test/1/1")
  n.appendSegment(i);
  var d = new ndn.Data(n, new ndn.SignedInfo(), "test");
  d.signedInfo.setFinalBlockID([0,99])
  d.signedInfo.setFields()
  d.sign()
  dat[i] = d.wireEncode().buffer;
}

global.ndn = ndn;
global.IO1 = IO1;

describe('IO', function(){
  describe('constructor', function(){
    it('should start without error without contentStore', function() {
      assert(IO1.interfaces, ".Interfaces not present")
      assert(IO1.nameTree, ".nameTree not present")
      assert(IO1.contentStore, ".contentStore not present")
    })
  })
  describe("fetchAllSegments", function(){
    it("should trigger onTimeout once", function(done){
      var n = new ndn.Name("test/1/1")
      n.appendSegment(0)
      var inst = new ndn.Interest(n)
      inst.setInterestLifetimeMilliseconds(10);

      IO1.fetchAllSegments(inst, function(){assert(false)}, function(){
        done();
      })
    })
    it("should call onEachData once and only once", function(done){
      var count = 0

      var n = new ndn.Name("test/1/1")
      n.appendSegment(0)
      var inst = new ndn.Interest(n)
      inst.setInterestLifetimeMilliseconds(1000);
      console.log(IO1.interfaces)
      var sent = []
      IO2 = new Interfaces({
        handleInterest: function(element, faceID){
          //console.log("handle interest called")
          var inst = new ndn.Interest()
          inst.wireDecode(element)
          var seg = ndn.DataUtils.bigEndianToUnsignedInt(inst.name.get(-1).getValue().buf());
          if (!sent[seg]){
            sent[seg] = true
            console.log("sending segment", seg)
            IO2.dispatch(dat[seg], (0 | (1<<faceID)));
          }
        },
        handleData: function(element, faceID){

        }
      });

      IO2.installTransport(transportClass)
      IO2.newFace(transportClass.prototype.name, ms.port2)
      global.IO2 = IO2;
      IO1.fetchAllSegments(inst, function(){
        count++
        console.log(count)
        assert(count <= 100, "count greater than 100")
        if (count == 100){
          done()
        }
      }, function(){
        console.log("timeout triggered")
        //assert(false, "timeout should not be triggered")
      })
    })
  })
})

