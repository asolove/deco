/** 
This file handles all direct communication with the server
**/

var STATUS = {
  username: "",
  session_id: 0,
  users: [],
  room_id: 0,
  rooms: [],
  last_update_time: 1,
  errors: 0, 
  collageItems: {}
};


// UPDATES
function getUpdates() {
  if(STATUS.errors > 2)
    return;

  new Ajax.Request("updates", {
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


// JOIN
// Join the normal way and get your default room.
// Or use your existing session to join a new room.
function sendJoin(username, password, room_id, name) {
  new Ajax.Request("join", {
    parameters: room_id ? { room_id: room_id, name: name, session_id : STATUS.session_id } : { username: username, password: password },
    method: 'get',
    onError: showLogin,
    onSuccess: joinSuccess
  });
  if(username) STATUS.username = username;
}

// PART
function sendPart(user){
  new Ajax.Request("part", {
    parameters: { session_id: STATUS.session_id },
    method: 'get'
  });
}

// SEND
function sendCollageUpdate(message){  
  message.session_id = STATUS.session_id;
  message["type"] = "collage";
  new Ajax.Request("send", {
    parameters: message,
    method: 'get'
  });
}

// UPLOAD
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