var io = require("./lib/ndn-io.js")


io.remoteTangle = function(opts, cb){
  console.log("remote tangle host: ", opts.host, " port: ", opts.port)
  io.initFace("tcp", {host: opts.host || "localhost", port: opts.port || 6464}, cb)
}

module.exports = io
