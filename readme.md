NDN-io
======

NDN-io is a javascript module for exchanging files and JSON over [Named Data Networks](http://named-data.net) in node.js and the browser(via browserify). The goal of this module is to allow web and node developers to experiment with NDN based apps without the hassle of having to micromanage data at the packet level. It is designed to store data in a [level-ndn](http://github.com/rynomad/level-ndn) repository by interfacing with a javascript [ndn-forwarder](http://github.com/rynomad/nfd-js). In addition to data publishing and retrieval, ndn-io contains managment utilities to create and manage interfaces between local and remote javascript forwarders. NDN-io is built atop the [NDN-js](http://github.com/named-data/ndn-js) library from UCLA.

Warning: Here Be Dragons
------------------------

This is alpha software built to allow web developers to experiment and prototype applications for Named Data Networks. It should not be used in production code. The API is subject to breaking changes before we get to version 0.1.0. Some methods may not map 1 to 1 between node and browser API's. Feedback, bug pings, and pull requests are welcome.

Initialization
===
Subject to frequent changes.

To use ndn-io, you must first "tangle" it with a forwarder.

```
var io = require("ndn-io")
  , options = {
    transport: 'websocket' // 'tcp' in node
    host: 'localhost'
    port: 6565 // 6464 for tcp
  }

function callback(){
  console.log("io tangled!")
}

io.remoteTangle(options, callback)

```

Managment
=====

io.makeFace(options, callback)
---------

tell the tangled forwarder to construct an interface to a forwarder with the given options. Options is an object with the following fields:

-protocol: 'th' for [telehash](http://telehash.org), 'ws' for websocket, or 'tcp'
-host: a domain name or ip address for tcp or websocket
-port: the port for tcp or websocket (defaults to 6464 and 6565 respectively)
-hashname: telehash only
-nextHop: (optional) a nexthop entry for the connection (see below)

The callback function will recieve two arguments, the first being the provided options, augmented with a 'faceID' integer that indicates the ID of the created face in the forwarder, and the second a boolean success indicator.

io.addNextHop(options, callback)
----------
Add a nextHop entry to the FIB on the forwarder.

options:
  uri (string): the prefix for the nextHop
  faceID (integer): the faceID to add the entry for

the callback function receives the given options and a boolean success indicator.


Data Retrieval/Publishing
=====

io.fetch(options, onData, onTimeout)
------

Fetch and return an object or file

options:
  -type: "object" or "file"
  -uri(string):
  -selectors(optional): an object with NDN interest selectors

selectors:
  -interestLifetime(integer default: 300): milliseconds before timeout (note: ndn-io does up to 4 requests internally before triggering a timeout, so account for this in your timing expectations)
  -childSelector("right" or "left"): lexicographical preference for child namespace.
  -exclude(array of strings): namespace components that should not be present in the returned data name.

the onData callback recieves three arguments: the uri of the request, the object or file, and the actual uri of the returned data. onTimeout recieves just the uri of the request.

io.publish(options, callback)
------

NB: publishing is only available if there is a [level-ndn](http://github.com/rynomad/level-ndn) repo serving the namespace in question.

options:
  -uri(string):
  -type("file" or "object"):
  -freshness(integer): freshness period for published packets (in caches), in milliseconds
  -thing(object, blob, or filesystem path(node only)):


The callback recieves two arguments: the options object and a boolean success indicator
