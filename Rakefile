task :default => :start

task :spec do
  system 'node spec/tacular.js'
end

task :start => :ensure_db do
  system 'rlwrap node src/server.js'
end

task :ensure_db do
  `mkdir db`
  `mkdir db/room`
end

task :repl do
  system `rlwrap node-repl`
end