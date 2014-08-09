var IO = require("../index.js")
var Interfaces = require("ndn-contrib").Interfaces


module.exports = function(Transport, connectionInfo1, connectionInfo2, assert){
  IO1 = new IO(Transport, connectionInfo1)
  var ndn = IO1.ndn;
  var dat = []

  for (var i = 0 ; i < 50; i++){
    var n = new ndn.Name("test/1/1")
    n.appendSegment(i);
    var d = new ndn.Data(n, new ndn.SignedInfo(), "test");
    d.signedInfo.setFinalBlockID([0,49])
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
        this.timeout(1000000000)
        var count = 0

        var n = new ndn.Name("test/1/1")
        n.appendSegment(0)
        var inst = new ndn.Interest(n)
        inst.setInterestLifetimeMilliseconds(100);
        //console.log(IO1.interfaces)
        var sent = []
        IO2 = new Interfaces({
          handleInterest: function(element, faceID){
            var inst = new ndn.Interest()
            inst.wireDecode(element)
            var seg = ndn.DataUtils.bigEndianToUnsignedInt(inst.name.get(-1).getValue().buf());
            if (!sent[seg]){
              sent[seg] = true;
              IO2.dispatch(dat[seg], (0 | (1<<faceID)));
            }
          },
          handleData: function(element, faceID){

          }
        });

        IO2.installTransport(Transport)
        IO2.newFace(Transport.prototype.name, connectionInfo2, function(){
          global.IO2 = IO2;
          IO1.fetchAllSegments(inst, function(arg, inst){
            count++
            assert(count <= 50, "count greater than 100")
            if (count == 50){
              done()
            }
          }, function(i){
            console.log("timeout triggered")
            //assert(false, "timeout should not be triggered")
          })
        })
      })

    })
  })

}
