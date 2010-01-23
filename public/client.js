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
  room_id: 0,
  last_update_time: 1,
  errors: 0, 
  collageItems: {}
};

function getUpdates() {
  if(STATUS.errors > 2)
    return;
    
  if(!STATUS.last_update_time)
    getUsers();

  new Ajax.Request("/updates", {
    method: 'get',
    parameters: {session_id: STATUS.session_id, since: STATUS.last_update_time },
    onError: function () {
      STATUS.errors += 1;
      addMessage("", "There was an error contacting the server.", new Date(), "error");
      setTimeout(getUpdates, 1000);
    },
    onSuccess: function (res) {
      STATUS.errors = 0;
      var data = JSON.parse(res.responseText);
      if(data && data.messages) data.messages.each(collageUpdate);
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

function sendJoin(username, password) {
  new Ajax.Request("/join", {
    parameters: { username: username, password: password, room_id: STATUS.room_id},
    method: 'get',
    onError: showLogin,
    onSuccess: joinSuccess
  });
}

function sendPart(user){
  new Ajax.Request("/part", {
    parameters: { session_id: STATUS.session_id },
    method: 'get'
  });
}

function sendCollageUpdate(message){  
  message.session_id = STATUS.session_id;
  message["type"] = "collage";
  new Ajax.Request("/send", {
    parameters: message,
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
  STATUS.session_id = session.session_id;
  
  getUpdates();
  showCollage();
}

// 
function collageUpdate(message){
  if(STATUS.last_update_time < message.time) STATUS.last_update_time = message.time;
  
  // FIXME: don't do if we already have this action
  if(message.id in STATUS.collageItems) {
    var input = STATUS.collageItems[message.id];
    updateCollageText(input, message.text, message);
  } else {
    addCollageText(message.id, message.text, message);
  }
};


function updateUsersList ( ) {
  $("usersLink").update(STATUS.users.length.toString() + " user" + (STATUS.users.length > 1 ? "s" : ""));
}


// UI States
function showLogin(){  $("login").show(); $("username").focus(); $("collage").hide(); }
function showCollage(){$("login").hide(); $("collage").show(); }
function showLoad(){ }

// Events
document.observe("dom:loaded", function() {
  Event.observe(window, "unload", sendPart);

  // Log In screen
  $("login-form").observe('submit', function (e) {
    e.stop();
    var username = $("username").value, password = $("password").value;
    sendJoin(username, password);    
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
  if(pos && ("x" in pos)) {
    var x = pos.x || input._x, y=pos.y || input._y, s=pos.s || 1, r=pos.r || 0;   
    input.style.cssText += ';z-index:'+(z++)+';left:'+x+'px;top:'+y+'px;';
    input.transform({ rotation: r, scale: s });
    input._x = x;
    input._y = y;
    input._rotation = r; input._r = r;
    input._scale = s; input._scale = s;
  }
  if(text) {
    input.value = text;
  }
  return false;
};

function positionAndAddElement(node, pos){
  node.style.cssText += ';z-index:'+(z++)+';left:'+pos.x+'px;top:'+pos.y+'px;';
  node._x = pos.x; node._y = pos.y; node._rotation = pos.r; node._r = pos.r; node._scale = pos.s; node._s = pos.s;
  node.transform({ rotation: pos.r, scale: pos.s });
  collage.insert(node);
  STATUS.collageItems[node.id] = node;
}

function addCollageImage(id, src, pos){
  if(!id) id = Math.uuid(10);
  var image = new Element("img", {src:src, id: id, height: 200});
  positionAndAddElement(image, pos);
  attachEvents(image, pos);
}

function addCollageText(id, text, pos) {
  if(!id) id = Math.uuid(10);
  var input = new Element("input", { value: text, id: id});
  positionAndAddElement(input, pos);
  attachEvents(input, pos);
  input.focus();
  
  input.observe("dblclick", function(event) { event.stop(); input.focus(); });
  input.observe("change", function(event){
    sendCollageUpdate({id:id, text: input.value, x: input._x, y: input._y, r: input._r, s: input._s });
  });
}

function attachEvents(node, pos){
  node.observe("manipulate:update", function(event){
    event.stop();
    var s = collage._s, memo = event.memo;
    var x1 = pos.x + memo.panX/s,
        y1 = pos.y + memo.panY/s, r1 = memo.rotation, s1 = memo.scale;
    if(s1 * s < .2) {
      node.remove(); return false;
    }
    node.style.cssText += ';z-index:'+(z++)+';left:'+x1+'px;top:'+y1+'px;';
    node.transform({ rotation: r1, scale: s1 });
    node._x = x1;
    node._y = y1;
    node._r = r1;
    node._s = s1;
  });
  
  node.observe("manipulate:end", function(event) {   
    sendCollageUpdate({id:node.id, x: node._x, y: node._y, r: node._r, s: node._s});
  });
}


collageViewportOffset = function(){
  var vO = collage.viewportOffset();
  vO.left = vO[0] += 400 - 400*collage._s;
  vO.top  = vO[1] += 247 - 247*collage._s;
  return vO;
};

$(document).observe("dom:loaded", function(){
  collage = $("collage"); chat = $("chat");
  
  
  var pos=[window.innerWidth/2, window.innerHeight/2, 0, 1];
  
  collage._s = 1;
  collage.observe("manipulate:update", function(event){
    collage.focus(); // blur text inputs
    collage.style.cssText += 
      ';z-index:'+(z++)+';left:'+(pos[0]+event.memo.panX)+'px;top:'+(pos[1]+event.memo.panY)+'px;';
    collage.transform({ scale: event.memo.scale });
    collage._s = event.memo.scale;
    collage._x = pos[0]+event.memo.panX;
    collage._y = pos[1]+event.memo.panY;
    event.stop();
  });

  collage.observe("dblclick", function(event){
    // FIXME: Firefox-only
    if(event.element() != collage) return false;
    var x = event.layerX, y = event.layerY;
    addCollageText(undefined, "", {x:x, y:y, s:1, r:0});
    event.stop();
  });
  
  // File upload
  collage.observe("dragover", function(event) {
    event.stop();
  }, true);
  collage.observe("drop", function(event) {
    event.stop();
    handleDroppedFiles(event.dataTransfer, {x:event.layerX, y:event.layerY, r:0, s:1});
  }, true);
});

function handleDroppedFiles(dataTransfer, pos) {
  if(!pos) pos = {x: 10, y:10, r: 0, s:1};
	var files = $A(dataTransfer.files);
	files.each(function(file){
	  if(file.fileSize < 1000000) {
		  var img = addCollageImage(undefined, file.getAsDataURL(), pos);
	  } else {
  		alert("file is too big, needs to be below 1mb");
	  }
	});
}
	

