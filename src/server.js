HOST = null; // localhost
PORT = 8001;

var fu = require("../lib/fu");
var sys = require("sys");

var MESSAGE_BACKLOG = 200;
var SESSION_TIMEOUT = 60 * 1000;

var channel = new function () {
  var messages = [];
  var callbacks = [];

  this.appendMessage = function (user, type, message) {
    var m = { user: user
            , type: type // "msg", "join", "part"
            , message: message
            , time: (new Date()).getTime()
            };

    switch (type) {
      case "msg":
        sys.puts("<" + user + "> " + message);
        break;
      case "join":
        sys.puts(user + " join");
        break;
      case "part":
        sys.puts(user + " part");
        break;
      case "collage":
        sys.puts(user + "collage update: " + JSON.stringify(message));
        break;
    }

    messages.push( m );

    while (callbacks.length > 0) {
      callbacks.shift().callback([m]);
    }

    while (messages.length > MESSAGE_BACKLOG)
      messages.shift();
  };

  this.query = function (since, callback) {
    var matching = [];
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.time > since)
        matching.push(message);
    }

    if (matching.length != 0) {
      callback(matching);
    } else {
      callbacks.push({ time: new Date(), callback: callback });
    }
  };

  // clear old callbacks
  // they can hang around for at most 30 seconds.
  setInterval(function () {
    var now = new Date();
    while (callbacks.length > 0 && now - callbacks[0].time > 30*1000) {
      callbacks.shift().callback([]);
    }
  }, 1000);
};

var sessions = {};

function createSession (user) {
  if (user.length > 50) return null;
  if (/[^\w_\-^!]/.exec(user)) return null;

  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.user === user) return null;
  }

  var session = { 
    user: user, 

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

fu.listen(PORT, HOST);

fu.get("/", fu.staticHandler("public/index.html"));
fu.get("/style.css", fu.staticHandler("public/style.css"));
fu.get("/client.js", fu.staticHandler("public/client.js"));
fu.get("/math.uuid.js", fu.staticHandler("public/math.uuid.js"));
fu.get("/prototype.s2.min.js", fu.staticHandler("public/prototype.s2.min.js"));


fu.get("/who", function (req, res) {
  sys.puts("/who request");
  var users = [];
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];
    users.push(session.user);
  }
  res.simpleJSON(200, { users: users });
});

fu.get("/join", function (req, res) {
  sys.puts("/join request");
  var user = req.uri.params["user"];
  if (user == null || user.length == 0) {
    res.simpleJSON(400, {error: "Bad username."});
    return;
  }
  var session = createSession(user);
  if (session == null) {
    res.simpleJSON(400, {error: "Username in use"});
    return;
  }

  channel.appendMessage(session.user, "join");
  res.simpleJSON(200, { id: session.id, user: session.user});
});

fu.get("/part", function (req, res) {
  sys.puts("part request");
  var id = req.uri.params.id;
  var session;
  if(id && (sessions[id])) {
    session = sessions[id];
    session.destroy();
  }
  res.simpleJSON(200, { });
});

fu.get("/updates", function (req, res) {
  sys.puts("/update request");
  sys.puts(JSON.stringify(req.uri.params));
  if (!("since" in req.uri.params)) {
    res.simpleJSON(400, { error: "Must supply since parameter" });
    return;
  }
  var id = req.uri.params.id, since = parseInt(req.uri.params.since, 10), session = false;
  if (id && (session = sessions[id]))
    session.poke();

  channel.query(since, function (messages) {
    if (session) session.poke();
    res.simpleJSON(200, { messages: messages });
  });
});

fu.get("/send", function (req, res) {
  sys.puts("/send request");
  var id = req.uri.params.id;
  var text = req.uri.params.text;

  var session = sessions[id];
  if (!session || !text) {
    res.simpleJSON(400, { error: "No such session id" });
    return; 
  }

  session.poke();

  channel.appendMessage(session.user, "msg", text);
  res.simpleJSON(200, {});
});

fu.get("/collage", function(req, res) {
  var id = req.uri.params.id;
  var session = sessions[id];
  if(!session){
    res.simpleJSON(400, { error: "No such session id"});
    return;
  }
  
  session.poke();
  channel.appendMessage(session.user, "collage", req.uri.params.message);
  res.simpleJSON(200, {});
});