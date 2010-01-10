"use strict";

// Utilities
util = {
  urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g, 

  zeroPad: function (digits, n) {
    n = n.toString();
    while (n.length < digits) 
      n = '0' + n;
    return n;
  },

  timeString: function (date) {
    var minutes = date.getMinutes().toString();
    var hours = date.getHours().toString();
    return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes);
  }
};

// Server communication
var STATUS = {
  user: "",
  session_id: 0,
  users: [],
  room: "",
  last_update_time: 0,
  errors: 0, 
  collageItems: {}
};

function processUpdates(data) {
  if(data && data.messages) {
    data.messages.each(function(update) {
      if (update.time > STATUS.last_update_time)
        STATUS.last_update_time = update.time;
      
      switch(update.type) {
        // chat updates
        case 'join':  chatJoin(update.user, update.time); break;
        case 'msg':   chatMessage(update.user, update.time, update.message); break;
        case 'part':  chatPart(update.user, update.time); break;
        // collage updates
        case 'move':   collageMove(update); break;
        case 'collage':collageUpdate(update); break;
        case 'new':    collageNew(update); break;
        case 'delete': collageDelete(update); break;
      }
    });
  }
}

function getUpdates() {
  if(STATUS.errors > 2)
    return;
    
  if(!STATUS.last_update_time)
    getUsers();

  new Ajax.Request("/updates", {
    method: 'get',
    parameters: {id: STATUS.session_id, since: STATUS.last_update_time },
    onError: function () {
      STATUS.errors += 1;
      addMessage("", "There was an error contacting the server.", new Date(), "error");
      setTimeout(getUpdates, 1000);
    },
    onSuccess: function (res) {
      STATUS.errors = 0;
      processUpdates(res.responseText.evalJSON());
      getUpdates();
    }
  });
}

function getUsers () {
  new Ajax.Request("/who", {
    onSuccess: function(transport, data) {
      if(STATUS != 'success') return;
      STATUS.users = data.users;
      updateUsersList();
    }
  });
}

function sendMessage(text) {
  new Ajax.Request("/send", { method: 'get', parameters: {id: STATUS.session_id, room: STATUS.room, text: text}});
}

function sendJoin(user) {
  new Ajax.Request("/join", {
    parameters: { user: user, room: "demo"},
    method: 'get',
    onError: showLogin,
    onSuccess: joinSuccess
  });
}

function sendPart(user){
  new Ajax.Request("/part", {
    parameters: { id: STATUS.session_id},
    method: 'get'
  });
}

function sendCollageUpdate(message){  
  message["type"] = "collage";
  new Ajax.Request("/collage", {
    parameters: { id: STATUS.session_id, message: JSON.stringify(message)},
    method: 'get'
  });
}


function joinSuccess (res) {
  var session = res.responseText.evalJSON();
  if (session.error) {
    alert("error connecting: " + session.error);
    showLogin();
    return;
  }
  
  STATUS.user = session.user;
  STATUS.session_id = session.id;
  
  getUpdates();
  showChat();
}

// Chat Actions
function chatJoin(user, time) {
  chatAddMessage(user, "joined", time);
  STATUS.users.push(user);
  updateUsersList();
}

function chatPart(user, time) {
  chatAddMessage(user, "left", time);
  STATUS.users = STATUS.users.without(user);
  updateUsersList();
}

function chatMessage(user, time, text) {
  chatAddMessage(user, text, time);
}

// Collage actions
function collageMove(data){
  if(data.user == STATUS.user) return;
  
};
function collageUpdate(data){
  data.message = JSON.parse(data.message);
  if(data.user == STATUS.user) {
    return false;
  }
  if(data.message.id in STATUS.collageItems) {
    var input = STATUS.collageItems[data.message.id];
    updateCollageText(input, data.message.text, data.message.pos);
  } else {
    addCollageText(data.message.id, data.message.text, data.message.pos);
  }
};
function collageNew(data){
  if(data.user == STATUS.user) return;
  
};
function collageDelete(data){
  if(data.user == STATUS.user) return;
  
};

// Chat UI
function chatAddMessage(user, text, time, _class) {
  if(!text) return;
  text = text.escapeHTML().replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');
  time = time ? new Date(time) : new Date();
  
  var message = new Element("div", { "class": "message " + _class + (user == STATUS.user ? " personal" : "")});
  message.update('<span class="date">' + util.timeString(time) + '</span>'
    + '<span class="user">' + user.escapeHTML() + '</span>'
    + '<span class="msg-text">' + text  + '</span>');
    
  $("log").insert(message);
}

function updateUsersList ( ) {
  $("usersLink").update(STATUS.users.length.toString() + " user" + (STATUS.users.length > 1 ? "s" : ""));
}


// UI States
function showLogin () {
  $("connect").show();
  $("loading").hide();
  $("connected").hide();
  $("userInput").focus();
}

function showLoad(){
  $("connect").hide();
  $("loading").show();
  $("connected").hide();
}

function showChat(){
  $("connected").show();
  $("entry").focus();

  $("connect").hide();
  $("loading").hide();
}

// Events
document.observe("dom:loaded", function() {
  
  Event.observe(window, "unload", sendPart);

  $("entry").observe("keypress", function (e) {
    if (e.keyCode != 13 /* Return */) return;
    var msg = $("entry").value.replace("\n", "");
    if (!msg.blank()) sendMessage(msg);
    $("entry").value = "";
  });

  $("connectButton").observe('click', function (e) {
    e.stop();
    showLoad();
    var nick = $("userInput").value;

    if (nick.length > 50) {
      alert("Nick too long. 50 character max.");
      showLogin();
      return false;
    }

    if (/[^\w_\-^!]/.exec(nick)) {
      alert("Bad character in nick. Can only have letters, numbers, and '_', '-', '^', '!'");
      showLogin();
      return false;
    }
    
    sendJoin(nick);

    return false;
  });
  
  showLogin();
});


// ***************
// Collage portion
// ***************

// Globals
S2.enableMultitouchSupport = true;
var collage, chat, z = 1;

// UI events

function updateCollageText(input, text, pos){
  if(pos && "x" in pos) {
    var x = pos.x || input._x, y=pos.y || input._y, s=pos.s || 1, r=pos.r || 0;   
    input.style.cssText += 
      ';z-index:'+(z++)+';left:'+x+'px;top:'+y+'px;';
    input.transform({ rotation: r1, scale: s1 });
    input._x = x;
    input._y = y;
    input._r = r;
    input._s = s;
  }
  if(text) {
    input.value = text;
  }
  return false;
};

function addCollageText(id, text, pos) {
  if(!id)
    id = Math.uuid(10);
  
  var x = pos.x, y = pos.y, s = pos.s, r = pos.r;
  
  var input = new Element("input", { value: text, style: "left:"+x+"px; top:"+y+"px;"});
  
  collage.insert(input);
  input.transform({rotation: r, scale: s});
  input.focus();
  STATUS.collageItems[id] = input;
  
  input.observe("dblclick", function() { event.stop(); input.focus(); });
  
  input.observe("manipulate:update", function(event){
    event.stop();
    var s = collage._s, memo = event.memo;
    var x1 = x + memo.panX/s, y1 = y + memo.panY/s, r1 = memo.rotation, s1 = memo.scale;
    input.style.cssText += 
      ';z-index:'+(z++)+';left:'+x1+'px;top:'+y1+'px;';
    input.transform({ rotation: r1, scale: s1 });
    input._x = x1;
    input._y = y1;
    input._r = r1;
    input._s = s1;
  });
  
  input.observe("manipulate:finished", function(event) {    
    sendCollageUpdate({id:id, pos:{x: x1, y: y1, r: r1, s: s1}, text:input.value});
  });
  
  input.observe("change", function(event){
    sendCollageUpdate({id:id, text: input.value, pos: {x: input._x, y: input._y, r: input._r, s: input._s}});
  });
}

$(document).observe("dom:loaded", function(){
  collage = $("collage"); chat = $("chat");
  var pos=[2, 2, 0, 1];
  
  collage.observe("manipulate:update", function(event){
    collage.focus(); // blur text inputs
    collage.style.cssText += 
      ';z-index:'+(z++)+';left:'+(pos[0]+event.memo.panX)+'px;top:'+(pos[1]+event.memo.panY)+'px;';
    chat.style.cssText += 'z-index:'+z+';';
    collage.transform({ scale: event.memo.scale });
    collage._s = event.memo.scale;
    collage._x = pos[0]+event.memo.panX;
    collage._y = pos[1]+event.memo.panY;
    event.stop();
  });

  collage.observe("dblclick", function(event){
    event.stop();
    addCollageText(undefined, "", {x:event.offsetX, y:event.offsetY, s:1, r:0});
  });
});

