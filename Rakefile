task :default => :spec

task :spec do
  system 'node spec/tacular.js'
end

task :start do
  system 'node src/server.new.js'
end

task :repl do
  system `rlwrap node-repl`
end