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
    
    cookie = require("../../vendor/cookie/cookie-node"),
    Dirty = require("../../vendor/node-dirty/lib/dirty").Dirty,
    router = require("../../vendor/node-router/node-router");

cookie.secret = "ajsnkS(J#lsmslshsiafi;j*3hH:OIlakhfdp89gh;F#hp98#:FO)";


var MESSAGE_BACKLOG = 200;
var SESSION_TIMEOUT = 15 * 60 * 1000;


/*

Models 

*/
var users = GLOBAL.users = require("./users");
var rooms = GLOBAL.rooms = require("./rooms");




// Sessions
var sessions = GLOBAL.sessions = {};

var Session = GLOBAL.Session = function(user, room){
  if(!users.valid(user)) return null;
  if(!(user.room_ids.indexOf(room.id) > -1)) return null;
  if(!rooms.valid(room)) return null;
  
  // FIXME add access control based on user: if invalid, return false;
  
  this.user = user;
  this.room = room;
  this.time = new Date();
  this.session_id = Math.floor(Math.random()*9999999999).toString();
  sessions[this.session_id] = this;
  room.addMessage({users: users.color_list(arguments.callee.users_in_room(room.id))});
};

Session.current = function(){
  res = [];
  for(var i in sessions){
    res.push(sessions[i].user.username);
  }
  return res;
};

Session.prototype.poke = function() { this.time = new Date(); };
Session.prototype.destroy = function() { 
  delete sessions[this.session_id]; 
  this.room.addMessage({users: users.color_list(Session.users_in_room(this.room.id))});
};

Session.users_in_room = function(room_id){
  res = [];
  var session;
  for(var session_id in sessions){
    session = sessions[session_id];
    if(session.room && session.room.id == room_id) {
      res.push(session.user);
    }
  }
  return res;
};

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
      session_id = req.getSecureCookie("session_id"), session;
  session_id = session_id.slice(0, session_id.length-2);
  session = sessions[session_id];
  req.params = params;
  req.session = session;
  if(!session){
    res.simpleJson(400, {error: "Access denied: invalid session."});
    return false;
  }
  return true;
}

var join_request = function(req, res){
  var params = qs.parse(url.parse(req.url).query || ""),
      username = params.username, password = params.password,
      user = users.find(username, password),
      room_id = params.room_id || (user && user.room_ids[0]);
  if(params.name && params.session_id){
    join_new_room_request(req, res);
  }
  if("room_id" in params && params.session_id) {
    join_room_request(req, res);
    return false;
  }
  if(!user){
    res.simpleJson(400, {error: "Username or password invalid."});
    return;
  } 
  var room = rooms.find(room_id), session = new Session(user, room);
  join_response(req, res, session);
};

var join_response = function(req, res, session){
  if (!session) {
    res.simpleJson(400, {error: "You do not have access to this room."});
    return;
  }
  sys.debug("creating session:" + session.session_id);
  res.setSecureCookie("session_id", session.session_id);
  res.simpleJson(200, { 
    users: users.color_list(Session.users_in_room(session.room.id)),
    rooms: rooms.list_for_user(session.user, session.room.id) });
};

var join_new_room_request = function(req, res){
  var room = rooms.make(qs.unescape(req.params["name"]));
  req.session.user.room_ids.push(room.id);
  req.params.room_id = room.id;
  users.save(req.session.user);
  
  var session = new Session(req.session.user, room);
  join_response(res, session);
  req.session.destroy();
}.pipeline(withSession);

var join_room_request = function(req, res){
  var session = new Session(req.session.user, rooms.find(req.params.room_id));

  join_response(res, session);
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
  message.username = req.session.user.username;
  message.time = new Date().getTime();
  req.session.room.addMessage(params);
  res.simpleJson(200, {});
}.pipeline(withSession);

var feedback_request = function(req, res){
  var params = qs.parse(url.parse(req.url).query || ""),
      session_id=req.getSecureCookie("session_id"), session=sessions[session_id];
  if(session){
    params.username = session.user.username;
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

function index_request(req, res){
  router.staticHandler(req, res, 'public/index.html');
}

function redirect_response(req, res){
  var body = "<a href='http://www.on-deco.com/app'>This page has moved.</a>";
  res.sendHeader(302, [ ["Location", "http://www.on-deco.com/app"],
                        ["Content-Type", "application/json"],
                        ["Content-Length", body.length] ]);
  res.sendBody(body);
  res.finish();
}

function error_response(req, res,e){
  sys.debug('EXCEPTION: ' + e);
  var body = "<h1>The server encountered an error.</h1><p>Notice has been sent to our support staff. <a href='http://www.on-deco.com/app'>Please log in again.</a></p>";
  res.sendHeader(500, [ ["Content-Type", "text/plain"],
                        ["Content-Length", body.length] ]);
}

var server = http.createServer(function(req, res) {
  try {
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
        break;
      case '':
        index_request(req, res);
        break;
      default:
        redirect_response(req, res);
        break;
    }
  } catch (e) {
    error_response(req, res, e);
  }
  
});

server.listen(8001);

repl.start("deco> ");