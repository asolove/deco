document.observe("dom:loaded", function() {

  // Log In screen
  $("username").observe("click", function(e) { e.stop(); $("username").focus(); });
  $("password").observe("click", function(e) { e.stop(); $("password").focus(); });
  $("login-form").observe('submit', function (e) {
    e.stop();
    var username = $("username").value, password = $("password").value;
    sendJoin(username, password);    
    return false;
  });
  showLogin();
  
  // Room select
  var rooms = $("rooms");
  rooms.observe("change", function(event){
    roomSwitch(rooms.value);
  });
  
  // Feedback screen  
  $("help-dialog").hide();
  $("close-feedback").observe("click", function(){$("help-dialog").hide();});
  $("help-dialog").observe("submit", function(event){
    event.stop();
    new Ajax.Request("feedback", {
      method: 'get',
      parameters: {session_id: STATUS.session_id, comments: $("comments").value }
    });
    $("comments").value = "";
    $("help-dialog").hide();
    return false;
  });
  $("help").observe("click", function(){ $("help-dialog").show(); $("comments").focus(); });
  $("comments").observe("click", function() { $("comments").focus(); });
  
  // Initialize collage canvas
  collage = $("collage");
  
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
    handleDroppedFiles(event, {x:event.layerX-100, y:event.layerY-100, r:0, s:1});
  }, true);
  
  // Part on window close
  Event.observe(window, "unload", sendPart);
});