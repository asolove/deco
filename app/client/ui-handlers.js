


function joinSuccess (res) {
  var session = res.responseText.evalJSON();
  if (session.error) {
    alert("error connecting: " + session.error);
    showLogin();
    return;
  }
  
  STATUS.session_id = session.session_id;
  
  if(!STATUS.logged_in)
    getUpdates();
  STATUS.logged_in = true;
  
  showCollage();
  updateRooms(session.rooms);
}

function updateRooms(room_list){
  var room_select = $("rooms"), id, name, option;
  $A(room_select.children).each(function(e){ e.remove();});
  
  room_list.unshift(["new", "+ Create new room"]);
  room_list.each(function(room){
    id = room[0]; name = room[1];
    option = new Element('option', { value: id, selected: room[2] }).insert(name);
    room_select.insert(option);
  });
  if(room_list.length > 1) room_select.show();
  return true;
}

function updateUsers(users){
  STATUS.users = {};
  var badges = $("badges"), previousUsers = [], username, color, badge;
  
  $A(badges.children).each(function(e){ e.remove();});
  
  users.each(function(user){
    username = user[0];
    color = user[1];
    
    if(previousUsers.indexOf(username) >= 0) return false;
    
    previousUsers.push(user[0]);
    STATUS.users[user[0]] = user[1];
    badge = new Element('span', { "class":"badge", "style":"background-color:"+user[1] }).insert(user[0]);
    user[0] == STATUS.username ? badges.insert({top: badge}) : badges.insert({bottom:badge});
  });
  return true;
}

// 
function collageUpdate(message){
  if(STATUS.last_update_time < message.time) STATUS.last_update_time = message.time;

  if(message.users) {
    updateUsers(message.users);
    return true;
  }
  
  if(message.id in STATUS.collageItems) {
    var input = STATUS.collageItems[message.id];
    updateCollageItem(input, message);
  } else if(!("_removed" in message)) {
    if(message.text) {
      addCollageText(message.id, message.text, message);
    } else {
      addCollageImage(message.id, message.src, message);
    }
  }
};

function roomSwitch(room_id){
  if(room_id == "new"){
    var name = prompt("Pick a name for your new room:");
  }
  sendJoin(undefined, undefined, room_id, name);
  setUp();
}


var collage, z = 1;
function setUp(){
  $A(collage.children).each(function(e){ e.remove();});
  var z = 1;
  STATUS.collageItems = {};
  STATUS.last_update_time = 1;
}

// UI States
function showLogin(){  $("login").show(); $("username").focus(); $("collage").hide(); $("rooms").hide(); }
function showCollage(){$("login").hide(); $("collage").show(); }
function showLoad(){ }


// Globals
S2.enableMultitouchSupport = true;



// UI events
function highlightCollageItem(node, username){
  if(!node || !username || !(username in STATUS.users)) return false;
  node.morph("border-color:"+STATUS.users[username], { duration: 1, position: 'parallel' })
      .morph("border-color:#111", { duration: 1 });
}

function updateCollageItem(node, message){
  if("_removed" in message) return node._removed ? undefined : node.remove();
  highlightCollageItem(node, message.username);
  if("x" in message) {
    var x = message.x || node._x, y=message.y || node._y, s=message.s || 1, r=message.r || 0;   
    node.style.cssText += ';z-index:'+(z++)+';left:'+x+'px;top:'+y+'px;';
    node.transform({ rotation: r, scale: s });
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
  var image = new Element("img", {src:src, id: id ? id : Math.uuid(10), height: 200});
  highlightCollageItem(image, pos.username);
  positionAndAddElement(image, pos);
  attachEvents(image, pos);
  if(id === undefined) {
    sendCollageUpdate(Object.extend(pos, { id: image.id, src:""}));
  }
  return image;
}

function addCollageText(id, text, pos) {
  if(!id) id = Math.uuid(10);
  var input = new Element("input", { value: text, id: id});
  positionAndAddElement(input, pos);
  attachEvents(input, pos);
  input.focus();
  highlightCollageItem(input, pos.username);
  
  input.observe("dblclick", function(event) { event.stop(); input.focus(); });
  input.observe("change", function(event){
    sendCollageUpdate({id:id, text: input.value, x: input._x, y: input._y, r: input._r, s: input._s });
  });
}

function attachEvents(node, pos){
  node.observe("manipulate:update", function(event){
    event.stop();
    var s = collage._s, memo = event.memo;
    var x1 = node._x + memo.panX/s,
        y1 = node._y + memo.panY/s,
        r1 = node._r = memo.rotation, 
        s1 = node._s = memo.scale;
        
    
    if(s1 * s < .2) {
      node._s = 0;
      node._removed = true;
      sendCollageUpdate({id: node.id, s: 0, _removed: true});
      node.remove(); 
      return false;
    }
    node.style.cssText += ';z-index:'+(z++)+';left:'+x1+'px;top:'+y1+'px;';
    node.transform({ rotation: r1, scale: s1 });
  });
  
  node.observe("manipulate:start", function(event){
    //var pO = node.positionedOffset();
    //node._origX = pO.left - pos.x; node._origY = pO.top - pos.y;
  });
  
  node.observe("manipulate:end", function(event) {
    if(node._removed) return;
    var pO = node.positionedOffset();
    node._panX = 0; node._panY = 0;
    node._x = pO.left; node._y = pO.top;
    var message = {id:node.id, x: node._x, y: node._y, r: node._r, s: node._s};
    if("value" in node) message["text"] = node.value;    
    sendCollageUpdate(message);
  });
}


collageViewportOffset = function(){
  var vO = collage.viewportOffset();
  vO.left = vO[0] += 400 - 400*collage._s;
  vO.top  = vO[1] += 247 - 247*collage._s;
  return vO;
};


function handleDroppedFiles(event, pos) {
  var dataTransfer = event.dataTransfer;
  if(!pos) pos = {x: 10, y:10, r: 0, s:1};
	var files = $A(dataTransfer.files);
	files.each(function(file){
	  if(file.fileSize < 1000000) {
	    pos.x += 30; pos.y += 30;
		  var img = addCollageImage(undefined, file.getAsDataURL(), pos);
		  uploadImageFile(file, img.id);
	  } else {
  		alert("This file is too large. Please upload files less than 1mb.");
	  }
	});
}
