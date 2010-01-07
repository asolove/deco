/* Base level methods */
var make = function(name, observers, users, messages){
      return {
        name: name || "A room", 
        observers: observers || [],
        users: users || [],
        messages: messages || []
      };
    },
    
    addMessage = function(aRoom, message){
      aRoom.messages.push(message);
    },
    
    messages = function(aRoom){
      return aRoom.messages;
    },
    
    addObserver = function(aRoom, observer){
      aRoom.observers.push(observer);
    },
    
    informObservers = function(aRoom, message){
      var obs = observers(aRoom), l = obs.length;
      for(var i=0;i<l;i++) 
        obs[i](message);
    },
    
    observers = function(aRoom){
      return aRoom.observers;
    };

/* Public methods */
var sendMessage = function(aRoom, message){
      addMessage(aRoom, message);
      informObservers(aRoom, message);
    };

exports.make = make;
exports.addMessage = addMessage;
exports.messages = messages;
exports.addObserver = addObserver;
exports.observers = observers;
exports.sendMessage = sendMessage;