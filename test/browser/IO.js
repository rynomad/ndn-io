var IO = require('../../index.js')
, transportClass = require("ndn-contrib/src/Transports/browser/MessageChannel.js")
, IO1
, Interfaces = require("ndn-contrib/src/DataStructures/Interfaces.js")
, dat = [];


var ms = new MessageChannel()

require("../IO.js")(transportClass, ms.port1, ms.port2, assert)
