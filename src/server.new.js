/**
Deco: The Code
  
Deco is a visual workspace helping designers, coders and bosses to communicate.

The state of each Deco room is a simple array of state changes in chronological
order.  Each state change is called a message. The room also has a list of
observers. The room calls each observer with each state changed.
**/
function Room(){
  if(this["Room"]) return new Room();
  this.messages = [];
  this.observers = [];
  return this;
}
Room.prototype.addMessage=function(message){
  this.state.push(message);
  this.inform(message);
};
Room.prototype.addObserver=function(obs){
  this.observers.push(obs);
};
Room.prototype.inform=function(message){
  var observer;
  while((observer = this.observers.shift())) observer(message, this);
};
Room.prototype.messagesSince=function(time){
  var r=[], ms = this.messages, ml = ms.length, m = false;
  for(var i=0; i<ml; i++){
    m = ms[i];
    if(m.time > time) r.push(m);
  }
  return r;
};

/** The persistence system observes the room: **/

function Persistence(){
  if(this["Persistence"]) return new Persistence();
  // create db connection, etc.
  this.rooms = [];
  return this;
}

Persistence.prototype.addMessage=function(message, room){
  
};
Persistence.prototype.getRoom=function(room_id){
  var room = false, persister = this;
  if(room_id in rooms){
    return rooms[room_id];
  } else {
    room = new Room();
    // set status
    room.addObserver(function(message, room) {
      persister.addMessage(message, room);
      room.addObserver(arguments.callee);
    });
    return room;
  }
};


/** A Session represents one user's time in a Room. **/
Persistence.prototype.createSession = function(user, room, res) {
  this.getRoom(room).addObserver(userObserver(user, res));
}

function userObserver(user, res) {
  var f = function(message) {
	  // ?
  }
}

/** 
Messages relate to either the text chat or the visual collage. The data
requirements are below.  The positional members should be numbers, and the
others, Strings.

The room's chat status is linear: to have the full state of the room, you must
have every chat message in order. The collage status changes, however, can be
commuted. Three messages moving the same image can be commuted to a single
message with the last position from those three.
**/

function isChatMessage(message){
  return message.subject === "chat" && message.text;
}
function isPictureMessage(message){
  return message.x && message.y && message.s && message.t && !(label in message);
}
function isLabelMessage(message){
  return message.x && message.y && message.s && message.t && label in message;
}

function isMessage(message){
  if(!(subject in message)) return false;
  if(!(time    in message)) return false;
  
  return(isChatMessage(message) || isPictureMessage(message) || isLabelMessage(message));
}

/**
All outside access to the rooms is through the Authorization system

The following requests are allowed:

  - receive: 
    requires valid session id, time, room_id that exists
  - send:
    requires valid session id, valid message, room_id that exists,
    message whose user has this session id
**/

function getOrWaitForUpdate(req, res){
  var time, room = false, messages = false, send = respondMessages(req, res);
  if((messages = room.query(time))){
    send(messages);
  } else {
    room.addObserver(function(message, room){ send([message]); });
  }
}

function respondMessages(req, res){
  return function(messages){
    res.simpleJSON(200, { messages: messages});
  };
}

Auth = {
  
};


/** Server **/
var fu = require("../lib/fu");
var sys = require("sys");

// Static files
fu.get("/", fu.staticHandler("public/index.html"));
fu.get("/style.css", fu.staticHandler("public/style.css"));
fu.get("/client.js", fu.staticHandler("public/client.js"));
fu.get("/prototype.s2.min.js", fu.staticHandler("public/prototype.s2.min.js"));

// Dynamic actions
fu.get("/join", function(req, res){
  var room = req.uri.params["room"],
      user = req.uri.params["user"];
  
  res.simpleJSON(200, "Hello, room!");
});

fu.get("/send", function(req, res){
  var room_id = req.uri.params["room_id"],
      user_id = req.uri.params["user_id"];
  res.simpleJSON(200, "Hello, send!");
});

fu.get("/receive", function(req, res){
  res.simpleJSON(200, "Hello, receive!");
});

fu.get("/part", function(req, res){
  res.simpleJSON(200, "Goodbye, world!");
});

// Server setup
PORT = 8002;
HOST = null;
fu.listen(PORT, HOST);