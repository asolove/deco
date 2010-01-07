var room = require("./../src/room");
var aRoom = null;

describe("A room", function(){
  beforeEach(function(){
    aRoom = room.make("Test room");
    test = null;
  });
  
  afterEach(function(){
    
  });
  
  it("adds an observer", function(){
    var obs = function(m){return m;};
    room.addObserver(aRoom, obs);
    assert(room.observers(aRoom).indexOf(obs) >= 0);
    });
  
  it("accepts a message and sends to its observers", function(){
    var message = { hello: "world"}, test = null;
    room.addObserver(aRoom, function(message) { test = message;});
    room.sendMessage(aRoom, message);
    assert(room.messages(aRoom).indexOf(message) >= 0);
    assertEqual(message, test);
  });
});