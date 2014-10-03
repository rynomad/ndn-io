var  transportClass = require("ndn-contrib/src/Transports/browser/MessageChannel.js")
, IO1
, dat = [];

var io = require("../IO.js")
var ms = new MessageChannel()
module.exports = function(assert){
  io("MessageChannelTransport", ms.port1, ms.port2, assert, transportClass);
}
