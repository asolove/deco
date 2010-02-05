task :default => :start

task :start => :ensure_db do
  system 'rlwrap node app/server/server.js'
end

task :ensure_db do
  `mkdir db`
  `mkdir db/room`
  `mkdir public/img`
end

task :make_js do
  require 'sprockets'
  secretary = Sprockets::Secretary.new(
    :asset_root   => "public",
    :load_path    => ["vendor/*", "vendor", "../scripty2"],
    :source_files => ["app/client/*.js"]
  )

  # Generate a Sprockets::Concatenation object from the source files
  concatenation = secretary.concatenation
  # Write the concatenation to disk
  concatenation.save_to("public/client.js")
end

task :repl do
  system `rlwrap node-repl`
end