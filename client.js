S2.enableMultitouchSupport = true;

Element.addMethods({
  getInnerText: function(element) {
    element = $(element);
    return (element.innerText || element.textContent);
  },
  setInnerText: function(element, value) {
    element = $(element);
    if (element.innerText)
      element.innerText = value;
    else
      element.textContent = value;
    return element;
  }
});

var CONFIG = { debug: false
             , nick: "#"   // set in onConnect
             , id: null    // set in onConnect
             , last_message_time: 0
             };

var nicks = [];

function updateUsersLink ( ) {
  var t = nicks.length.toString() + " user";
  if (nicks.length != 1) t += "s";
  $("usersLink").update(t);
}

function userJoin(nick, timestamp) {
  addMessage(nick, "joined", timestamp, "join");
  for (var i = 0; i < nicks.length; i++)
    if (nicks[i] == nick) return;
  nicks.push(nick);
  updateUsersLink();
}

function userPart(nick, timestamp) {
  addMessage(nick, "left", timestamp, "part");
  for (var i = 0; i < nicks.length; i++) {
    if (nicks[i] == nick) {
      nicks.splice(i,1)
      break;
    }
  }
  updateUsersLink();
}

// utility functions

util = {
  urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g, 

  //  html sanitizer 
  toStaticHTML: function(inputHtml) {
    return inputHtml.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
  }, 

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
  },

  isBlank: function(text) {
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  }
};

function scrollDown () {
  window.scrollBy(0, 100000000000000000);
  $("entry").focus();
}

function addMessage (from, text, time, _class) {
  if (text === null)
    return;

  if (time == null) {
    // if the time is null or undefined, use the current time.
    time = new Date();
  } else if ((time instanceof Date) === false) {
    // if it's a timestamp, interpret it
    time = new Date(time);
  }

  var messageElement = $(document.createElement("div"));

  messageElement.addClassName("message");
  if (_class)
    messageElement.addClassName(_class);

  // sanitize
  text = util.toStaticHTML(text);

  // See if it matches our nick?
  var nick_re = new RegExp(CONFIG.nick);
  if (nick_re.exec(text))
    messageElement.addClassName("personal");

  // replace URLs with links
  text = text.replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');

  var content = '<span class="date">' + util.timeString(time) + '</span>'
              + '<span class="nick">' + util.toStaticHTML(from) + '</span>'
              + '<span class="msg-text">' + text  + '</span>'
              ;
              
  messageElement.innerHTML = content;

  $("log").insert(messageElement);
  scrollDown();
}

var transmission_errors = 0;
var first_poll = true;

function longPoll (data) {
  if (transmission_errors > 2) {
    showConnect();
    return;
  }

  if (data && data.messages) {
    for (var i = 0; i < data.messages.length; i++) {
      var message = data.messages[i];

      if (message.timestamp > CONFIG.last_message_time)
        CONFIG.last_message_time = message.timestamp;

      switch (message.type) {
        case "msg":
          addMessage(message.nick, message.text, message.timestamp);
          break;

        case "join":
          userJoin(message.nick, message.timestamp);
          break;

        case "part":
          userPart(message.nick, message.timestamp);
          break;
      }
    }
    if (first_poll) {
      first_poll = false;
      who();
    }
  }


  new Ajax.Request("/recv",
    { method: 'get'
    , parameters: { since: CONFIG.last_message_time, id: CONFIG.id }
    , onError: function () {
        addMessage("", "long poll error. trying again...", new Date(), "error");
        transmission_errors += 1;
        setTimeout(longPoll, 10*1000);
      }
    , onSuccess: function (res) {
        transmission_errors = 0;
        var data = res.responseText.evalJSON();
        longPoll(data);
      }
    });
}

function send(msg) {
  if (CONFIG.debug === false) {
    // XXX should be POST
    new Ajax.Request("/send", { method: 'get', parameters: {id: CONFIG.id, text:msg}})
  }
}

function showConnect () {
  $("connect").show();
  $("loading").hide();
  $("connected").hide();
  $("nickInput").focus();
}

function showLoad () {
  $("connect").hide();
  $("loading").show();
  $("connected").hide();
}

function showChat (nick) {
  $("connected").show();
  $("entry").focus();

  $("connect").hide();
  $("loading").hide();

  scrollDown();
}

function onConnect (res) {
  var session = res.responseText.evalJSON();
  if (session.error) {
    alert("error connecting: " + session.error);
    showConnect();
    return;
  }

  CONFIG.nick = session.nick;
  CONFIG.id   = session.id;

  showChat(CONFIG.nick);
}

function outputUsers () {
  var nick_string = nicks.length > 0 ? nicks.join(", ") : "(none)";
  addMessage("users:", nick_string, new Date(), "notice");
  return false;
}

function who () {
  new Ajax.Request("/who", {
    onSuccess: function(transport, data) {
      if(status != 'success') return;
      nicks = data.nicks
      outputUsers();
    }
  });
}

document.observe("dom:loaded", function() {

  $("entry").observe("keypress", function (e) {
    if (e.keyCode != 13 /* Return */) return;
    var msg = $("entry").value.replace("\n", "");
    if (!util.isBlank(msg)) send(msg);
    $("entry").value = "";
  });

  $("usersLink").observe("click", outputUsers);

  $("connectButton").observe('click', function (e) {
    e.stop();
    showLoad();
    var nick = $("nickInput").value;

    if (nick.length > 50) {
      alert("Nick too long. 50 character max.");
      showConnect();
      return false;
    }

    if (/[^\w_\-^!]/.exec(nick)) {
      alert("Bad character in nick. Can only have letters, numbers, and '_', '-', '^', '!'");
      showConnect();
      return false;
    }
    
    new Ajax.Request("/join",  
    { parameters: { nick: nick}
    , method: 'get'
    , onError: function() {
        showConnect();
      }
    , onSuccess: onConnect
    });

    return false;
  });

  // update the clock every second
  setInterval(function () {
    var now = new Date();
    $("currentTime").setInnerText(util.timeString(now));
  }, 1000);

  if (CONFIG.debug) {
    $("loading").hide();
    $("connect").hide();
    scrollDown();
    return;
  }

  longPoll();
  showConnect();
  
  // collage
  var collage = $("collage"), chat = $("chat"), z=1, pos=[2, 2, 0, 1];
  
  collage.observe("manipulate:update", function(event){
    collage.style.cssText += 
      ';z-index:'+(z++)+';left:'+(pos[0]+event.memo.panX)+'px;top:'+(pos[1]+event.memo.panY)+'px;';
    chat.style.cssText += 'z-index:'+z+';';
    collage.transform({ scale: event.memo.scale });
    collage._x = pos[0]+event.memo.panX;
    collage._y = pos[1]+event.memo.panY;
    event.stop();
  });
  
  //collage.transform({ rotation: pos[2]});
  //collage.morph("left:"+pos[0]+"px;top:"+pos[1]+"px;");
}); // end dom:load

$(document).observe("unload", function () {
  new Ajax.Request("/part", { parameters: {id: CONFIG.id}});
});
