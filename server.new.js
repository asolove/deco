/**
Deco: The Code
  
Deco is a visual workspace helping designers, coders and bosses to communicate.

The state of each Deco room is a simple array of state changes in chronological order.
Each state change is called a message. The room also has a list of observers. The room
calls each observer with each state changed.
**/
function Room(){
  if(this["Room"]) return new Room();
  this.messages = [];
  this.observers = [];
  return this;
}
Room.prototype.addMessage=function(message){
  this.state.push(message);
  this.inform(message);
};
Room.prototype.addObserver=function(obs){
  this.observers.push(obs);
};
Room.prototype.inform=function(message){
  var observer;
  while(observer=this.observers.shift()) observer(message, this);
};

/** The persistence system observes the room: **/

function Persistence(){
  if(this["Persistence"]) return new Persistence();
  // create db connection, etc.
  this.rooms = [];
  return this;
}
Persistence.prototype.addMessage=function(message, room){
  
};
Persistence.prototype.getRoom=function(room_id){
  var room = false, persister = this;
  if(room_id in rooms){
    return rooms[room_id];
  } else {
    room = new Room();
    // set status
    room.addObserver(function(message, room) {
      persister.addMessage(message, room);
      room.addObserver(arguments.callee);
    });
    return room;
  }
};

/** 
Messages relate to either the text chat or the visual collage. The data requirements are below.
The positional members should be numbers, and the others, Strings.

The room's chat status is linear: to have the full state of the room, you must have
every chat message in order. The collage status changes, however, can be commuted. Three messages
moving the same image can be commuted to a single message with the last position from those three.
**/

function isChatMessage(message){
  return message.subject === "chat" && message.text;
}
function isPictureMessage(message){
  return message.x && message.y && message.s && message.t && !(label in message);
}
function isLabelMessage(message){
  return message.x && message.y && message.s && message.t && label in message;
}

function isMessage(message){
  if(!(subject in message)) return false;
  if(!(time    in message)) return false;
  if(!(user    in message)) return false;
  
  return(isChatMessage(message) || isPictureMessage(message) || isLabelMessage(message));
}  