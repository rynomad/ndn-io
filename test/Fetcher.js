var Fetcher = require("../src/Fetcher.js")
var ndn = require("ndn-contrib");
var ioShim = {}
var assert = require("assert")
var pub;
ioShim.nameTree = new ndn.NameTree()
ioShim.contentStore = new ndn.ContentStore(ioShim.nameTree);
ioShim.PIT = new ndn.PIT(ioShim.nameTree);
ioShim.FIB = new ndn.FIB(ioShim.nameTree);
ioShim.ndn = ndn.ndn;
Fetcher.installContrib(ndn);
var fetcher = new Fetcher(ioShim)

module.exports = function(assert){
  describe("Fetcher", function(){
    it("should assemble String", function(){
      var d = new ndn.ndn.Data(new ndn.ndn.Name(), new ndn.ndn.SignedInfo(), "stringTest")
      assert(fetcher.assembleString([d.content] )=== "stringTest")
    })
    it("should assemble JSON", function(){
      var obj = {
        thing: 4
      };
      var string = JSON.stringify(obj)
      var str1 = string.substring(0,4)
      var str2 = string.substring(4, string.length)
      var d1 = new ndn.ndn.Data(new ndn.ndn.Name(), new ndn.ndn.SignedInfo(), str1);
      var d2 = new ndn.ndn.Data(new ndn.ndn.Name(), new ndn.ndn.SignedInfo(), str2);
      assert(fetcher.assembleJSON([d1.content, d2.content]).thing === 4)

    })

  })

}
