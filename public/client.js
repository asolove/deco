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
    updateCollageItem(input, message);
  } else {
    if(message.text) {
      addCollageText(message.id, message.text, message);
    } else {
      addCollageImage(message.id, message.src, message);
    }
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
function updateCollageItem(node, message){
  if("x" in message) {
    var x = message.x || node._x, y=message.y || node._y, s=message.s || 1, r=message.r || 0;   
    node.style.cssText += ';z-index:'+(z++)+';left:'+x+'px;top:'+y+'px;';
    node.transform({ rotation: r, scale: s });
    node._panX += x - node._x;
    node._panY += y - node._y;
    node._x = x;
    node._y = y;
    node._rotation = r; node._r = r;
    node._scale = s; node._scale = s;
  }
  if(message.text) node.value = message.text;
  if(message.src) node.src = message.src;
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
  pos.x = pos.x || 0; pos.y = pos.y || 0; pos.s = pos.s || 1; pos.r = pos.r || 0;
  if(!id) id = Math.uuid(10);
  var image = new Element("img", {src:src, id: id, height: 200});
  positionAndAddElement(image, pos);
  attachEvents(image, pos);
  if(!id) {
    sendCollageUpdate(Object.extend(pos, { id: id, src:""}));
  }
  return image;
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
  node._origX = 0;
  node._origY = 0;
  node.observe("manipulate:update", function(event){
    event.stop();
    console.log(pos.x, node._origX, event.memo.panX, node._x);
    var s = collage._s, memo = event.memo;
    var x1 = node._origX + (memo.panX-node._origX)/s,
        y1 = pos.y + node._origY + (memo.panY-node._origY)/s,
        r1 = memo.rotation, s1 = memo.scale;
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
  
  node.observe("manipulate:start", function(event){
    //var pO = node.positionedOffset();
    //node._origX = pO.left - pos.x; node._origY = pO.top - pos.y;
  });
  
  node.observe("manipulate:end", function(event) {   
    node._origX = node.positionedOffset().left;
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
    handleDroppedFiles(event, {x:event.layerX, y:event.layerY, r:0, s:1});
  }, true);
  
  // Let users click in to form fields
  $("username").observe("click", function() { $("username").focus(); });
  $("password").observe("click", function() { $("password").focus(); });
});

function handleDroppedFiles(event, pos) {
  var dataTransfer = event.dataTransfer;
  if(!pos) pos = {x: 10, y:10, r: 0, s:1};
	var files = $A(dataTransfer.files);
	files.each(function(file){
	  if(file.fileSize < 1000000) {
		  var img = addCollageImage(undefined, file.getAsDataURL(), pos);
		  uploadImageFile(file, img.id);
	  } else {
  		alert("This file is too large. Please upload files less than 1mb.");
	  }
	});
}

function uploadImageFile(file, id) {
  var boundary = '------multipartformboundary' + (new Date).getTime(),
      xhr = new XMLHttpRequest(),
      dashes = '--', crlf = '\r\n', result = dashes + boundary + crlf;
       
  result += 'Content-Disposition: form-data; name="user_file[]"';
  if (file.fileName) {
    result += '; filename="' + file.fileName + '"';
  }
  result += crlf;
  
  result += 'Content-Type: application/octet-stream' + crlf + crlf;
  
  /* Append binary data. */
  result += file.getAsBinary();
  result += crlf;
  result += dashes + boundary + dashes + crlf;
  
  xhr.open("POST", "upload?session_id="+STATUS.session_id+"&id="+id);
  xhr.overrideMimeType('text/plain; charset=x-user-defined-binary');
  
  xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
  xhr.sendAsBinary(result);        
  
  xhr.onload = function(event) { 
    /* If we got an error display it. */
    if (xhr.responseText && xhr.responseText != "{}") {
        alert(xhr.responseText);
    }
  };
}

	

