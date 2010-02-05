HOST = null; // localhost
PORT = 8001;

var events = require("events"),
    http = require("http"),
    multipart = require("multipart"),
    path = require("path"),
    posix = require("posix"),
    qs = require("querystring"),
    repl = require("repl"),
    sys = require("sys"),
    url = require("url"),
    
    Dirty = require("../../vendor/node-dirty/lib/dirty").Dirty,
    router = require("../../vendor/node-router/node-router");

var MESSAGE_BACKLOG = 200;
var SESSION_TIMEOUT = 15 * 60 * 1000;


/*

Models 

*/

// Users
var users = GLOBAL.users = {};
var users = GLOBAL.users = new Dirty("db/users", {flushInterval: 10});

var User = GLOBAL.User = function(username, password, room_ids){
  if(username.length > 50) return null;
  if(/[^\w_\-^!]/.exec(username)) return null;
  if(username in users) return null;
  
  this.username = username;
  this.password = password;
  users[this.username] = this;
  this.room_ids = room_ids;
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

// Rooms
var rooms = new Array(); // set to current length of rooms

var Room = GLOBAL.Room = function(name, messages){
  var room = this;
  room.callbacks = [];
  room.name = name;
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



/*

BETA TEST accounts

*/
var test_room = GLOBAL.test_room = new Room([]);

var ec_room = GLOBAL.ec_room = new Room([]);
new User("ssolove", "betafish2", [ec_room.id]);
new User("energycentral", "betablocker7", [ec_room.id]);

var modalinc_room = GLOBAL.modalinc_room = new Room([]);
new User("dcaulk", "betafish1", [modalinc_room.id]);
new User("modalinc", "betarisk5", [modalinc_room.id]);

var kpowers_room = GLOBAL.kpowers_room = new Room([]);
new User("kpowers", "alphabeta3", [kpowers_room.id]);
new User("kpowers_guest", "betaboost8", [kpowers_room.id]);

var markf_room = GLOBAL.markf_room = new Room([]);
new User("markf", "betatastic2", [markf_room.id]); // mark
new User("markf_guest", "betaboost0", [markf_room.id]);

var daltonlp_room = GLOBAL.daltonlp_room = new Room([]);
new User("daltonlp", "betafish4", [daltonlp_room.id]); // daltonlp@gmail.com
new User("daltonlp_guest", "alphabeta8", [daltonlp_room.id]); 

var teddywing_room = GLOBAL.teddywing_room = new Room([]);
new User("fig", "betafish9", [teddywing_room.id]); // fig@teddywing.com
new User("fig_guest", "betafish6", [teddywing_room.id]);


new User("asolove", "test", [test_room.id, teddywing_room.id, daltonlp_room.id, kpowers_room.id, ec_room.id]);




/* 

CONTROLLERS

*/

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
  var params = qs.parse(url.parse(req.url).query || ""),
      username = params.username, password = params.password,
      user = User.find(username, password),
      room_id = params.room_id || user.room_ids[0];
      
  if(params.room_id && params.session_id) {
    join_room_request(req, res);
    return false;
  }
  if(!user){
    res.simpleJson(400, {error: "Username or password invalid."});
    return;
  } 
  var room = Room.find(room_id), session = new Session(user, room);
  join_response(res, session);
};

var join_response = function(res, session){
  if (!session) {
    res.simpleJson(400, {error: "You do not have access to this room."});
    return;
  }
  res.simpleJson(200, { session_id: session.session_id });
};

var join_room_request = function(req, res){
  join_response(new Session(req.session.user, req.params.room_id));
  req.session.destroy();
}.pipeline(withSession);

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

var feedback_request = function(req, res){
  var params = qs.parse(url.parse(req.url).query || ""),
      session_id=params.session_id, session=sessions[session_id];
  if(session_id){
    params.username = sessions[session_id].user.username;
  }
  sys.debug("FEEDBACK: " + JSON.stringify(params));
};

var upload_request = function(req, res) {
  req.setBodyEncoding("binary");
  var stream = new multipart.Stream(req);
  
  var closePromise = new events.Promise();
  
  // Add handler for a request part received
  stream.addListener("part", function(part) {
    // FIXME: get multiple id's on upload, check unique/safe file name
    var openPromise = null, item_id = req.params.id, filename = item_id + path.extname(part.filename);
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
    case 'feedback':
      feedback_request(req, res);
    case '':
      router.staticHandler(req, res, 'public/index.html');
      break;
    default:
      // FIXME: huge security issue
      router.staticHandler(req, res, 'public/'+qs.unescape(path));
      break;
  }
});

server.listen(8001);

repl.start("deco> ");