HOST = null; // localhost
PORT = 8001;

var fu = require("../lib/fu"),
    sys = require("sys"),
    repl = require("repl");

var MESSAGE_BACKLOG = 200;
var SESSION_TIMEOUT = 5 * 60 * 1000;


// Users
var users = GLOBAL.users = {};

var User = GLOBAL.User = function(username, password){
  if(username.length > 50) return null;
  if(/[^\w_\-^!]/.exec(username)) return null;
  if(username in users) return null;
  
  this.username = username;
  this.password = password;
  users[this.username] = this;
};

User.valid = function(user){
  return user.constructor == User && user.username in users && users[user.username] == user;
};
User.find = function(username, password){
  var user = false;
  if((user = users[username]) && (user.password = password)){
    return user;
  } else {
    return false;
  }
};

new User("asolove", "test");
new User("someone", "test");


// Rooms
var rooms = new Array(); // set to current length of rooms

var Room = GLOBAL.Room = function(messages){
  var room = this;
  room.messages = messages || [];
  room.callbacks = [];
  room.id = rooms.length;
  rooms[room.id] = room;
  setInterval(function(){room.clearCallbacks();}, 1000);
};
Room.find = function(id){
  return rooms[id];
};
Room.valid = function(room){
  return room.constructor == Room && room.id in rooms && rooms[room.id] == room;
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



// Sessions
var sessions = GLOBAL.sessions = {};

var Session = GLOBAL.Session = function(user, room){
  if(!User.valid(user)) return null;
  if(!Room.valid(room)) return null;
  // FIXME add access control based on user: if invalid, return false;
  
  this.user = user;
  this.room = room;
  this.time = new Date();
  this.id = Math.floor(Math.random()*99999999).toString();
  sessions[this.id] = this;
};

Session.prototype.poke = function() { this.time = new Date(); };
Session.prototype.destroy = function() { delete sessions[this.id]; };

Session.timeout = function(){
  var cutoff = new Date() - SESSION_TIMEOUT, session = null;
  for(var id in sessions){
    if(!sessions.hasOwnProperty(id)) continue;
    session = sessions[id];
    if(cutoff > session.time) session.destroy();
  }
};
setInterval(Session.timeout, 1000);



// Controller pipelines
Function.prototype.pipeline = function(f){
  var wrapped = this;
  return function(req, res){
    if(f(req, res)) wrapped(req, res);
  };
};

function withSession(req, res){
  var id=req.uri.params.id, session=sessions[id];
  if(!session){
    res.simpleJSON(400, {error: "Access denied: invalid session."});
    return false;
  }
  process.mixin(req, { session: session });
  return true;
}


fu.listen(PORT, HOST);
fu.get("/", fu.staticHandler("public/index.html"));
fu.get("/style.css", fu.staticHandler("public/style.css"));
fu.get("/client.js", fu.staticHandler("public/client.js"));
fu.get("/math.uuid.js", fu.staticHandler("public/math.uuid.js"));
fu.get("/prototype.s2.min.js", fu.staticHandler("public/prototype.s2.min.js"));

fu.get("/join", function (req, res) {
  var username = req.uri.params.username, password = req.uri.params.password;
  var user = User.find(username, password);
  if(!user){
    res.simpleJSON(400, {error: "Username or password invalid."});
    return;
  } 
  var room = Room.find(req.uri.params.room_id), session = new Session(user, room);
  if (!session) {
    res.simpleJSON(400, {error: "You do not have access to this room."});
    return;
  }
  
  sys.puts("/join request: " + username);
  res.simpleJSON(200, { id: session.id });
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
  var since = parseInt(req.uri.params.since, 10);
  req.session.poke();
  req.session.room.query(since, function (messages) {
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