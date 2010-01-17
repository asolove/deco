HOST = null; // localhost
PORT = 8001;

var fu = require("../lib/fu"),
    sys = require("sys"),
    repl = require("repl");

var MESSAGE_BACKLOG = 200;
var SESSION_TIMEOUT = 5 * 60 * 1000;

var rooms = new Array(); // set to current length of rooms

var Room = GLOBAL.Room = function(messages){
  var room = this;
  room.messages = messages || [];
  room.callbacks = [];
  room.id = rooms.length;
  rooms[room.id] = room;
  setInterval(function(){room.clearCallbacks();}, 1000);
};

var the_room = GLOBAL.the_room = new Room([]);

Room.prototype.addMessage = function(message){
  message.time = (new Date()).getTime();
  sys.puts("Message added: " + sys.inspect(message));

  this.messages.push(message);
  var data = JSON.stringify(message);
  this.callbacks.forEach(function(c){c(data);});
};

Room.prototype.query = function(since, callback){
  var res = [];
  this.messages.forEach(function(m){
    if(m.time > since){
      res.push(m);
    }
  });
  if(res.length > 0){
    callback(res);
  } else {
    this.callbacks.push({callback: callback, time: new Date()});
  }
};

Room.prototype.clearCallbacks = function(){
  var now = new Date();
  while (this.callbacks.length > 0 && now - this.callbacks[0].time > 30*1000) {
    this.callbacks.shift().callback([]);
  }
};

var sessions = {};

function createSession (user, room_id) {
  if (user.length > 50) return null;
  if (/[^\w_\-^!]/.exec(user)) return null;

  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.user === user) return null;
  }

  var session = { 
    user: user, 
    room_id: room_id,
    id: Math.floor(Math.random()*99999999999).toString(),
    time: new Date(),
    poke: function () {
      session.time = new Date();
    },
    destroy: function () {
      channel.appendMessage(session.user, "part");
      delete sessions[session.id];
    }
  };

  sessions[session.id] = session;
  return session;
}

// interval to kill off old sessions
setInterval(function () {
  var now = new Date();
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];

    if (now - session.time > SESSION_TIMEOUT) {
      session.destroy();
    }
  }
}, 1000);


// Controller pipelines
Function.prototype.pipeline = function(f){
  return function(req, res){
    if(f(req, res)) this(req, res);
  };
};

function withSession(req, res){
  var id=req.uri.params.id, session=sessions[id], room_id=req.uri.params.room_id, room=rooms[room_id];
  if(!session || !room || !(session.room_id==room_id)){
    res.simpleJSON(400, {error: "Access denied: invalid session or room."});
    return false;
  }
  process.mixin(req, {
    room_id: room_id,
    room: room,
    id: id,
    session: session
  });
  return true;
}


fu.listen(PORT, HOST);
fu.get("/", fu.staticHandler("public/index.html"));
fu.get("/style.css", fu.staticHandler("public/style.css"));
fu.get("/client.js", fu.staticHandler("public/client.js"));
fu.get("/math.uuid.js", fu.staticHandler("public/math.uuid.js"));
fu.get("/prototype.s2.min.js", fu.staticHandler("public/prototype.s2.min.js"));

fu.get("/join", function (req, res) {
  var user = req.uri.params.user;
  sys.puts("/join request: " + user);
  if (!user || user.length == 0) {
    res.simpleJSON(400, {error: "Bad username."});
    return;
  }
  var session = createSession(user);
  if (!session) {
    res.simpleJSON(400, {error: "Username in use."});
    return;
  }
  var room_id = req.uri.params.room_id, room = rooms[room_id];
  if(!room){
    res.simpleJSON(400, {error: "Unknown room."});
    return;
  }
  
  res.simpleJSON(200, { id: session.id, user: session.user});
});

fu.get("/part", function (req, res) {
  req.session.destroy();
  res.simpleJSON(200, { });
}.pipeline(withSession));

fu.get("/updates", function (req, res) {
  if (!("since" in req.uri.params)) {
    res.simpleJSON(400, { error: "Must supply since parameter" });
    return;
  }
  var since = parseInt(req.uri.params.since, 10), session = false;
  req.session.poke();

  req.room.query(since, function (messages) {
    req.session.poke();
    res.simpleJSON(200, { messages: messages });
  });
}.pipeline(withSession));

fu.get("/send", function(req, res) {
  req.session.poke();
  req.room.addMessage(req.uri.params.message);
  res.simpleJSON(200, {});
}.pipeline(withSession));

repl.start("deco> ");