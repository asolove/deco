var Dirty = require("../../vendor/node-dirty/lib/dirty").Dirty;
var users = GLOBAL.users = require("./users");

var rooms = exports;

rooms.list = new Dirty("db/rooms", {flushInterval:10});
rooms.list.load();


var Room = GLOBAL.Room = function(room_data){
  var room = this, room_data = room_data || {};
  room.callbacks = [];
  room.name = room_data.name;
  room.id = room_data.id;
  room.messages = new Dirty("db/room/"+room.id, {flushInterval: 10});
  room.messages.load();
  setInterval(function(){room.clearCallbacks();}, 1000);
};

rooms.make = function(name){
  var room = rooms.save({name: name, id: rooms.list.length});
  return new Room(room);
};

rooms.save = function(room){
  var savable_room = {name:room.name, id: room.id};
  rooms.list.set(room.id, room);
  return room;
};

rooms.find = function(id){
  var room_data = rooms.list.get(id);
  return new Room(room_data);
};

rooms.list_for_user = function(user, session_room_id){
  var res = [];
  for(var i = 0, l = user.room_ids.length; i<l; i++){
    var room = rooms.list.get(user.room_ids[i]);
    if(!room) continue;
    res.push([room.id, room.name, session_room_id == room.id ? true : undefined]);
  }
  return res;
};

rooms.valid = function(room){
  return room.constructor == Room && rooms.list.get(room.id);
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