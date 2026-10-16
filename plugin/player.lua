if vim.g.loaded_player_nvim then
  return
end
vim.g.loaded_player_nvim = true

vim.api.nvim_create_user_command("Player", function(opts)
  require("player").open(opts.args ~= "" and opts.args or nil)
end, { nargs = "?", desc = "Open the player dashboard or play a source" })

vim.api.nvim_create_user_command("PlayerPlay", function(opts)
  if opts.args == "" then
    require("player").pick_local()
  else
    require("player").play(opts.args)
  end
end, { nargs = "?", complete = "file", desc = "Play a local file or streaming URL" })
vim.api.nvim_create_user_command("PlayerPause", function() require("player").toggle_pause() end, { desc = "Toggle playback" })
vim.api.nvim_create_user_command("PlayerStop", function() require("player").stop() end, { desc = "Stop playback" })
vim.api.nvim_create_user_command("PlayerNext", function() require("player").next() end, { desc = "Play next queued track" })
vim.api.nvim_create_user_command("PlayerPrev", function() require("player").previous() end, { desc = "Play previous queued track" })
vim.api.nvim_create_user_command("PlayerQueue", function() require("player").pick_local(true) end, { desc = "Add a local file to the player queue" })
vim.api.nvim_create_user_command("PlayerQueueAdd", function(opts)
  if opts.args == "" then require("player").pick_local(true) else require("player").queue_add(opts.args) end
end, { nargs = "?", complete = "file", desc = "Add a file or URL to the queue" })
vim.api.nvim_create_user_command("PlayerQueueList", function() require("player").queue_list() end, { desc = "Browse and play queued tracks" })
vim.api.nvim_create_user_command("PlayerQueueClear", function() require("player").queue_clear() end, { desc = "Stop playback and clear the queue" })
vim.api.nvim_create_user_command("PlayerShuffle", function(opts)
  local player = require("player")
  if opts.args == "on" then player.toggle_shuffle(true)
  elseif opts.args == "off" then player.toggle_shuffle(false)
  elseif opts.args == "" then player.toggle_shuffle()
  else vim.notify("Use :PlayerShuffle [on|off]", vim.log.levels.ERROR, { title = "player.nvim" }) end
end, { nargs = "?", complete = function() return { "on", "off" } end, desc = "Toggle queue shuffle" })
vim.api.nvim_create_user_command("PlayerRepeat", function(opts)
  local player = require("player")
  player.cycle_repeat(opts.args ~= "" and opts.args or nil)
end, { nargs = "?", complete = function() return { "off", "queue", "track" } end, desc = "Cycle or set repeat mode" })
vim.api.nvim_create_user_command("PlayerSearch", function(opts) require("player").search(opts.args) end, { nargs = "*", desc = "Search streaming sources with yt-dlp" })
vim.api.nvim_create_user_command("PlayerDownload", function(opts) require("player").download(opts.args) end, { nargs = "?", desc = "Download audio with yt-dlp" })
vim.api.nvim_create_user_command("PlayerEQ", function(opts) require("player").eq(opts.args) end, { nargs = "?", desc = "Configure player equalizer" })
vim.api.nvim_create_user_command("PlayerFilter", function(opts) require("player").filter(opts.args) end, { nargs = "?", desc = "Configure audio filter" })
vim.api.nvim_create_user_command("PlayerLyrics", function(opts) require("player").lyrics(opts.args) end, { nargs = "?", desc = "Fetch lyrics from lrc.red by ISRC" })
vim.api.nvim_create_user_command("PlayerLyricsSearch", function(opts) require("player").lyrics_search(opts.args) end, { nargs = "*", desc = "Search lyrics across LRCLIB and JioSaavn catalog" })
vim.api.nvim_create_user_command("PlayerTranslate", function(opts) require("player").translate(opts.args) end, { nargs = "?", desc = "Translate current karaoke lyrics" })
vim.api.nvim_create_user_command("PlayerJioSaavn", function(opts) require("player").jiosaavn(opts.args) end, { nargs = "*", desc = "Search and play JioSaavn results" })
vim.api.nvim_create_user_command("PlayerVisualize", function() require("player").visualize() end, { desc = "Toggle mpv's live audio spectrum window" })
vim.api.nvim_create_user_command("PlayerStatus", function() require("player").status() end, { desc = "Show player status" })
vim.api.nvim_create_user_command("PlayerQuit", function() require("player").shutdown() end, { desc = "Quit player process" })

vim.api.nvim_create_autocmd("VimLeavePre", {
  group = vim.api.nvim_create_augroup("player_nvim_lifecycle", { clear = true }),
  callback = function() require("player").shutdown() end,
})
