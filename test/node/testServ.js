var net = require('net');
var connections = [];
var server = net.createServer(function(c) { //'connection' listener
  console.log('server connected');
  for (var i = 0; i < connections.length; i++){
    c.pipe(connections[i]).pipe(c)
  }

  connections.push(c);
  c.on('end', function() {
    console.log('server disconnected');
  });
  c.write('hello\r\n');
  c.pipe(c);
});
server.listen("/var/tmp/IOT.sock", function(){
  console.log('server bound', server);
})
