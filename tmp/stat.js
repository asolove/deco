var sys = require("sys");

process.watchFile("test", function(curr, prev){
  sys.puts(sys.inspect(curr));
  sys.puts(sys.inspect(prev));
});