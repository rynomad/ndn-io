var Publisher = require("../src/Publisher.js")
var ndn = require("ndn-contrib");
var ioShim = {}
var assert = require("assert")
var pub;
ioShim.nameTree = new ndn.NameTree()
ioShim.contentStore = new ndn.ContentStore(ioShim.nameTree);
ioShim.PIT = new ndn.PIT(ioShim.nameTree);
ioShim.FIB = new ndn.FIB(ioShim.nameTree);
ioShim.ndn = ndn.ndn;
Publisher.installContrib(ndn)

module.exports= function(assert){
  describe("Publisher crossPlatform", function(){
    describe("contstructor", function(){
      it("should attach contentStore", function(){
        pub = new Publisher(ioShim);
        assert(pub.contentStore instanceof ndn.ContentStore);
      })
    })

    describe("setFreshnessPeriod", function(){
      it("freshnessPeriod should be default before set", function(){
        assert(pub.freshnessPeriod == 60 * 60 * 1000)

      })
      it("should accept setter", function(){
        pub.setFreshnessPeriod(1000)
        assert(pub.freshnessPeriod == 1000)
      })
    })

    describe("setName", function(){
      it("should accept setter", function(){
        pub.setName("test/Name")
        assert(pub.name instanceof ndn.ndn.Name)
        assert(pub.name.toUri() === "/test/Name")
      })
    })

    describe("setToPublish", function(){

      it("should accept string", function(){
        pub.setToPublish("string")
        assert(pub.toPublish == "string");
      })

      it("should accept valid json", function(){
        var obj = {
          test: "string"
        }
        pub.setToPublish(obj)
        assert(pub.toPublish == obj);
      })

      it("should reject circular json", function(done){
        var bad = {
          test: bad
        }
        bad.test = bad
        try{
          pub.setToPublish(bad)
        } catch (e) {
          done();
        }
      })

      it("should accept Buffer", function(){
        var buf = new Buffer([0,1,2])
        pub.setToPublish(buf)
        assert(pub.toPublish === buf)
      })

    })

    describe("publish", function(){

      describe("should de-mux", function(){

        it("string", function(done){
          pub.publishString = function(){done();};
          pub.setToPublish("STRING")
          pub.publish();
        })

        it("object", function(done){
          pub.publishJSON = function(){done();};
          pub.setToPublish({"STRING": "string"})
          pub.publish();
        })

        it("filePath", function(done){
          pub.publishFile = function(){done();};
          pub.setToPublish("file://Path/to/file")
          pub.publish();
        })

        it("Buffer", function(done){
          pub.publishFile= function(){done();}
          pub.setToPublish(new Buffer([207]))
          pub.publish();
        })
      })
      pub = new Publisher(ioShim);

      it("should publish JSON", function(done){
        pub.setName("testPub")
        pub.setToPublish({obj:"stuff"})
        pub.publish( function(firstData){
          console.log("callback")
          assert(firstData instanceof ndn.ndn.Data, "firsData not being sent in callback")
          assert(pub.contentStore.nameTree["/testPub"], "nameTree not reflecting branch")
          console.log(pub.contentStore.nameTree)
          assert(pub.contentStore.nameTree["/testPub/%00%00"], "nameTree not reflecting leaf" , pub.contentStore.nameTree)
          var inst = new ndn.ndn.Interest(pub.name)
          var d = new ndn.ndn.Data()
          var res = (pub.contentStore.check(inst))
          assert((res instanceof Buffer) || (res instanceof Uint8Array), "contentStore not returning BUffer")
          d.wireDecode(pub.contentStore.check(inst))
          assert(JSON.parse(d.content.toString()).obj === "stuff")
          done();
        })
      })

      it("should publish String", function(done){
        pub.setName("testPubString")
        pub.setToPublish("stuff")
        pub.publish( function(firstData){
          console.log("callback")
          assert(firstData instanceof ndn.ndn.Data)
          assert(pub.contentStore.nameTree["/testPubString"])
          assert(pub.contentStore.nameTree["/testPubString/%00%00"])
          var inst = new ndn.ndn.Interest(pub.name)
          var d = new ndn.ndn.Data()

          var res = (pub.contentStore.check(inst))
          assert((res instanceof Buffer) || (res instanceof Uint8Array) )
          d.wireDecode(pub.contentStore.check(inst))
          assert(d.content.toString() === "stuff")
          done();
        })
      })
      /*
      it("should publish Buffer", function(done){
        pub.setName("testPubBuffer")
        pub.setToPublish((new Buffer([207])))
        pub.publish( function(firstData){
          console.log("callback")
          assert(firstData instanceof ndn.ndn.Data)
          assert(pub.contentStore.nameTree["/testPubBuffer"])
          assert(pub.contentStore.nameTree["/testPubBuffer/%00%00"])
          var inst = new ndn.ndn.Interest(pub.name)
          var d = new ndn.ndn.Data()
          var res = (pub.contentStore.check(inst))
          assert((res instanceof Buffer) || (res instanceof Uint8Array) )
          d.wireDecode(pub.contentStore.check(inst))
          console.log(d.content)
          assert((d.content[0] === 207) || (d.content.data[0] === 207))
          done();
        })
      })*/

    })

  })

}
