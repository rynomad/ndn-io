
var IO = require('../../index.js')
, contrib = require("ndn-contrib")
, transportClass = contrib.Transports.WebSocketServer
, ws = require("ws");

module.exports = function(assert){


  var server = new ws.Server({port: 7575})
  server.on("connection",function(ws){
    sockets.push(ws)
    if (sockets.length > 1){
      ws.on("message", function(message){
        try{
          console.log("got message on socket 2")
          sockets[0].send(message)
        } catch(e){
          console.log("error sending to socket1")
        }
      });
      sockets[0].on("message", function(message){
        try{
          console.log("got message on socket 1")
          ws.send(message)
        }catch (e){
          console.log("error sending to 2")
        }
      });
    } else {
    }
  })
  var io = require("../IO.js")
  var sockets = []

  var p1 = ws.createConnection("ws://localhost:7575")
  var p2 = ws.createConnection("ws://localhost:7575")
  io("WebSocketServerTransport", p1, p2, assert, transportClass)

}
