var Dirty = require("../../vendor/node-dirty/lib/dirty").Dirty;
var rooms = GLOBAL.rooms = require("./rooms");

var users = exports;

users.list = new Dirty("db/users", {flushInterval:10});
users.list.load();

users.make = function(username, password, room_ids){
  if(username.length > 50) return null;
  if(/[^\w_\-^!]/.exec(username)) return null;
  if(username in users) return null;
  var user = {username:username, password:password, room_ids:room_ids};
  users.list.set(username, user);
  return user;
};

users.make_with_room = function(username, password){
  var room = rooms.make(username+"'s room");
  var user = users.make(username, password, [room.id]);
};

users.save = function(user){
  users.list.set(user.username, user);
};

users.valid = function(user){
  return users.list.get(user.username) == user;
};

users.find = function(username, password){
  var user = users.list.get(username);
  if(user && user.password == password){
    return user;
  }
  return false;
};

colors = ["#00a5f8", "#ffd503", "#8200f8", "#16ff91"];

users.color_list = function(users){
  var res = [];
  for(var i=0,l=users.length;i<l;i++){
    res.push([users[i].username, colors[i%colors.length]]);
  }
  return res;
};