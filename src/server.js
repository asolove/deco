HOST = null; // localhost
PORT = 8001;

var sys = require("sys"),
    http = require("http"),
    multipart = require("multipart"),
    posix = require("posix"),
    repl = require("repl"),
    url = require("url"),
    events = require("events"),
    qs = require("querystring"),
    Dirty = require("../lib/node-dirty/lib/dirty").Dirty,
    router = require("../lib/node-router/node-router");

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
  room.callbacks = [];
  room.id = rooms.length;
  room.messages = new Dirty("db/room/"+room.id, {flushInterval: 10});
  room.messages.load();
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

Room.prototype.allMessages = function(){
  return this.messages.filter(function(){return true;});
};

Room.prototype.addMessage = function(message){
  this.messages.add(message);
  this.callbacks.forEach(function(c){c.callback([message]);});
};

Room.prototype.query = function(since, callback){
  if(since == 1 && this.messages.length > 1) callback(this.allMessages());
  
  var res = this.messages.filter(function(m){ return(m.time > since); });
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
  this.session_id = Math.floor(Math.random()*99999999).toString();
  sessions[this.session_id] = this;
};

Session.prototype.poke = function() { this.time = new Date(); };
Session.prototype.destroy = function() { delete sessions[this.session_id]; };

Session.timeout = function(){
  var cutoff = new Date() - SESSION_TIMEOUT, session = null;
  for(var session_id in sessions){
    if(!sessions.hasOwnProperty(session_id)) continue;
    session = sessions[session_id];
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
  var params = qs.parse(url.parse(req.url).query || ""),
      session_id=params.session_id, session=sessions[session_id];
  req.params = params;
  req.session = session;
  if(!req.session){
    res.simpleJson(400, {error: "Access denied: invalid session."});
    return false;
  }
  return true;
}

var join_request = function(req, res){
  var params = qs.parse(url.parse(req.url).query),
      username = params.username, password = params.password,
      user = User.find(username, password);
  if(!user){
    res.simpleJson(400, {error: "Username or password invalid."});
    return;
  } 
  var room = Room.find(params.room_id), session = new Session(user, room);
  if (!session) {
    res.simpleJson(400, {error: "You do not have access to this room."});
    return;
  }
  
  sys.puts("joined: " + username);
  res.simpleJson(200, { session_id: session.session_id });
};

var part_request = function(req, res){
  req.session.destroy();
  res.simpleJson(200, { });
}.pipeline(withSession);

var updates_request = function(req, res){
  var params = req.params;
  if (!("since" in params)) {
    res.simpleJson(400, { error: "Must supply since parameter" });
    return;
  }
  var since = parseInt(params.since, 10);
  req.session.poke();
  req.session.room.query(since, function (messages) {
    req.session.poke();
    res.simpleJson(200, { messages: messages });
  });
}.pipeline(withSession);

var send_request = function(req, res){
  var params = req.params;
  req.session.poke();
  var message = params; // Need to clean these
  delete message["session_id"];
  message.username = req.session.user.username;
  message.time = new Date().getTime();
  req.session.room.addMessage(params);
  res.simpleJson(200, {});
}.pipeline(withSession);


var upload_request = function(req, res) {
  sys.debug("Upload file request");
  req.setBodyEncoding("binary");
  var stream = new multipart.Stream(req);
  
  var closePromise = new events.Promise();
  
  // Add handler for a request part received
  stream.addListener("part", function(part) {
    // FIXME: get multiple id's on upload, check unique/safe file name
    var openPromise = null, filename = part.filename, item_id = req.params.id;
    part.addListener("body", function(chunk) {    
        if (!openPromise) openPromise = posix.open("./public/img/" + filename, process.O_CREAT | process.O_WRONLY, 0600);
        openPromise.addCallback(function(fd) {
          req.pause();
          posix.write(fd, chunk).addCallback(function() {
            req.resume();
          });
        });
    });
    
    part.addListener("complete", function(){
      sys.debug("File now available at: /img/"+filename);
      req.session.room.addMessage(
        { time: new Date().getTime()
        , username: req.session.user.username
        , id: item_id
        , src: "/img/"+filename });
        
      openPromise.addCallback(function(fd){
        posix.close(fd).addCallback(function() {
          closePromise.emitSuccess();
        });
      });
    });
  });
  
  stream.addListener("complete", function() {
    closePromise.addCallback(function() {
      sys.debug(" => file upload complete");
      res.simpleJson(200, { });
    });
  });
}.pipeline(withSession);


function addResponseOptions(res){
  res.simpleJson = function (code, json, extra_headers) {
		var body = JSON.stringify(json);
    res.sendHeader(code, (extra_headers || []).concat(
	                       [ ["Content-Type", "application/json"],
                           ["Content-Length", body.length]
                         ]));
    res.sendBody(body);
    res.finish();
  };
  return res;
}

var server = http.createServer(function(req, res) {
  addResponseOptions(res);
  
  var path = url.parse(req.url).pathname.slice(1);
  sys.puts("request for: "+path);
  switch (path) {
    case 'join':
      join_request(req, res);
      break;
    case 'part':
      part_request(req, res);
      break;
    case 'updates':
      updates_request(req, res);
      break;
    case 'send':
      send_request(req, res);
      break;
    case 'upload':
      upload_request(req, res);
      break;
    case '':
      router.staticHandler(req, res, 'public/index.html');
      break;
    default:
      // FIXME: huge security issue
      router.staticHandler(req, res, 'public/'+path);
      break;
  }
});

server.listen(8001);

repl.start("deco> ");