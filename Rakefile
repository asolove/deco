task :default => :start

task :spec do
  system 'node spec/tacular.js'
end

task :start do
  system 'node src/server.js'
end

task :repl do
  system `rlwrap node-repl`
end