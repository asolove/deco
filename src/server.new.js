function Room(messages){
  this.sessions = [],
  this.messages = messages || [];
}

Room.prototype.addMessage = function(message){
  this.sendToSessions(message);
  this.saveMessage(message);
}

Room.prototype.sendToSessions = function(message){
  var data = JSON.stringify(message);
  this.sessions.forEach(function(s) { s(data)});
}

Room.prototype.saveMessage = function(message){
  
}

Room.prototype.addSocket = function(socket){
  socket.addListener("receive", function(data){
    var message = JSON.parse(data);
  }).addListener("close", function(){
    this.removeSocket(socket);
  })
}