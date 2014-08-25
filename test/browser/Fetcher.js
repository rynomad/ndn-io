
var Fetcher = require("../../src/Fetcher.js")
var ndn = require("ndn-contrib");
var ioShim = {}
var pub;
ioShim.nameTree = new ndn.NameTree()
ioShim.contentStore = new ndn.ContentStore(ioShim.nameTree);
ioShim.PIT = new ndn.PIT(ioShim.nameTree);
ioShim.FIB = new ndn.FIB(ioShim.nameTree);
ioShim.ndn = ndn.ndn;
Fetcher.installContrib(ndn);
var fetcher = new Fetcher(ioShim)

var test = require("../Fetcher.js")

describe("Fetcher", function(){
  it("should assemble blob", function(){

      var obj = {
        thing: 4
      };
      var string = JSON.stringify(obj)
      var str1 = string.substring(0,4)
      var str2 = string.substring(4, string.length)
      var d1 = new ndn.ndn.Data(new ndn.ndn.Name(), new ndn.ndn.SignedInfo(), str1);
      var d2 = new ndn.ndn.Data(new ndn.ndn.Name(), new ndn.ndn.SignedInfo(), str2);

      var ret = fetcher.assembleFile([d1.content, d2.content], "application/json")
      assert( ret instanceof Blob)
      assert (ret.type === "application/json")
  })
})
module.exports = function(assert){
  test(assert);
}
