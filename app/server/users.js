var Dirty = require("../../vendor/node-dirty/lib/dirty").Dirty;
var rooms = GLOBAL.rooms = require("./rooms");

var users = exports;

users.list = new Dirty("db/users", {flushInterval:10});
users.list.load();

colors = ["#00a5f8", "#ffd503", "#8200f8", "#16ff91", "#ff1be7", "#00e400", "#e89e00"];

users.make = function(username, password, room_ids, color){
  if(username.length > 50) return null;
  if(/[^\w_\-^!]/.exec(username)) return null;
  if(username in users) return null;
  var user = { username:username
             , password:password
             , room_ids:room_ids
             , color: color || colors[users.list.length % colors.length]
             };
  users.list.set(username, user);
  return user;
};

users.make_with_room = function(username, password){
  var room = rooms.make(username+"'s room");
  var user = users.make(username, password, [room.id]);
};

// Non-persistent guest account with limited permissions
users.create_guest = function(){
  var guest = users.list.get("guest");
  return { username: "guest"+Math.floor(Math.random()*999)
         , password: ""
         , room_ids: guest.room_ids
         , color: colors[Math.floor(Math.random()*colors.length)]
         };
};

users.save = function(user){
  users.list.set(user.username, user);
};

users.valid = function(user){
  return (users.list.get(user.username) == user) || user.username.slice(0,5) == "guest";
};

users.find = function(username, password){
  var user = users.list.get(username);
  if(user && user.password == password){
    return user;
  }
  return false;
};


users.color_list = function(users){
  var res = [];
  for(var i=0,l=users.length;i<l;i++){
    res.push([users[i].username, users[i].color]);
  }
  return res;
};