local M = {}
local state = { buf = nil, win = nil, timer = nil, frame = 0, title = "No track selected", artist = "Choose a local track or search a service", position = 0, duration = 0, paused = false }
local blocks = { "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█" }
local dashboard_ns = vim.api.nvim_create_namespace("player.nvim.dashboard")

local function stop_timer()
  if state.timer then state.timer:stop(); state.timer:close(); state.timer = nil end
end

local function set_style()
  vim.api.nvim_set_hl(0, "PlayerSurface", { bg = "#17151d", fg = "#eeeaf2", default = true })
  vim.api.nvim_set_hl(0, "PlayerBorder", { fg = "#d85c86", bg = "#17151d", default = true })
  vim.api.nvim_set_hl(0, "PlayerEyebrow", { fg = "#e58ca5", bold = true, default = true })
  vim.api.nvim_set_hl(0, "PlayerTitle", { fg = "#fff7fb", bold = true, default = true })
  vim.api.nvim_set_hl(0, "PlayerMuted", { fg = "#aaa1b2", default = true })
  vim.api.nvim_set_hl(0, "PlayerAccent", { fg = "#ff739b", bold = true, default = true })
  vim.api.nvim_set_hl(0, "PlayerBar", { fg = "#b85e85", default = true })
end

local function eq_bar()
  local bands = require("player.config").options.eq.bands
  local out = {}
  for i = 1, 10 do
    local gain = require("player.config").options.eq.enabled and (tonumber(bands[i]) or 0) or 0
    local level = math.max(1, math.min(8, math.floor((gain + 12) / 3.5) + 1))
    out[#out + 1] = blocks[level]
  end
  return table.concat(out, "  ")
end

local function bar()
  local width = 34
  local ratio = state.duration > 0 and math.max(0, math.min(1, state.position / state.duration)) or 0
  local filled = math.floor(width * ratio)
  return string.rep("━", filled) .. (filled < width and "●" or "") .. string.rep("─", math.max(0, width - filled - 1))
end

local function clock(seconds)
  if not seconds or seconds < 0 then return "--:--" end
  return string.format("%d:%02d", math.floor(seconds / 60), math.floor(seconds % 60))
end

local function draw()
  if not (state.buf and vim.api.nvim_buf_is_valid(state.buf)) then stop_timer(); return end
  local pulses = { "◉", "◎", "◉", "◉" }
  local pulse = pulses[(state.frame % 4) + 1]
  local title = state.title:gsub("\n", " ")
  local artist = state.artist:gsub("\n", " ")
  local lines = {
    "  PLAYER  ·  MUSIC FOR THE MOMENT",
    "",
    "                " .. pulse,
    "",
    "  NOW PLAYING",
    "  " .. title,
    "  " .. artist,
    "",
    "  " .. bar(),
    string.format("  %s                                                  %s", clock(state.position), clock(state.duration)),
    "",
    "  EQ CURVE",
    "  " .. eq_bar(),
    "",
    "  [p] play/pause    [n] next    [b] back    [l] lyrics    [/] search",
    "  [j] JioSaavn      [v] spectrum    [f] filter    [e] equalizer",
    "  [r] local files   [q] close",
  }
  vim.bo[state.buf].modifiable = true
  vim.api.nvim_buf_set_lines(state.buf, 0, -1, false, lines)
  vim.bo[state.buf].modifiable = false
  vim.api.nvim_buf_clear_namespace(state.buf, dashboard_ns, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerEyebrow", 0, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerTitle", 5, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerMuted", 6, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerBar", 8, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerMuted", 9, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerEyebrow", 11, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerAccent", 12, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerMuted", 14, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerMuted", 15, 0, -1)
  vim.api.nvim_buf_add_highlight(state.buf, dashboard_ns, "PlayerMuted", 16, 0, -1)
end

local function poll()
  if not (state.buf and vim.api.nvim_buf_is_valid(state.buf)) then stop_timer(); return end
  state.frame = state.frame + 1
  local mpv = require("player.mpv")
  if not mpv.is_alive() then state.title, state.artist, state.position, state.duration = "No track selected", "Choose a local track or search a service", 0, 0; draw(); return end
  mpv.property("media-title", function(value) if value then state.title = value end; draw() end)
  mpv.property("time-pos", function(value) if type(value) == "number" then state.position = value end; draw() end)
  mpv.property("duration", function(value) if type(value) == "number" then state.duration = value end; draw() end)
  mpv.property("pause", function(value) state.paused = value == true; draw() end)
  mpv.property("metadata/by-key/artist", function(value) if type(value) == "string" and value ~= "" then state.artist = value end; draw() end)
end

local function close()
  stop_timer()
  if state.win and vim.api.nvim_win_is_valid(state.win) then pcall(vim.api.nvim_win_close, state.win, true) end
  state.win, state.buf = nil, nil
end

function M.open()
  close()
  set_style()
  local width, height = math.max(40, math.min(74, vim.o.columns - 8)), 19
  state.buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_name(state.buf, "player://dashboard-" .. tostring((vim.uv or vim.loop).hrtime()))
  vim.bo[state.buf].buftype, vim.bo[state.buf].bufhidden, vim.bo[state.buf].swapfile = "nofile", "wipe", false
  vim.bo[state.buf].filetype = "playerdashboard"
  draw()
  state.win = vim.api.nvim_open_win(state.buf, true, {
    relative = "editor", width = width, height = height,
    row = math.max(1, math.floor((vim.o.lines - height) / 2)), col = math.max(1, math.floor((vim.o.columns - width) / 2)),
    style = "minimal", border = "rounded", title = "  player.nvim  ", title_pos = "center",
  })
  vim.wo[state.win].winhl = "Normal:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow"
  vim.wo[state.win].wrap = false
  local function map(key, fn, desc)
    vim.keymap.set("n", key, fn, { buffer = state.buf, silent = true, desc = desc })
  end
  map("q", close, "Close player dashboard")
  map("<Esc>", close, "Close player dashboard")
  map("p", function() require("player").toggle_pause() end, "Toggle playback")
  map("n", function() require("player").next() end, "Next track")
  map("b", function() require("player").previous() end, "Previous track")
  map("l", function() require("player").lyrics() end, "Open lyrics")
  map("/", function() require("player").lyrics_search() end, "Search lyrics")
  map("j", function() require("player").jiosaavn() end, "Search JioSaavn")
  map("v", function() require("player.mpv").visualize() end, "Toggle spectrum window")
  map("f", function() require("player").filter() end, "Configure filter")
  map("e", function() require("player").eq() end, "Configure equalizer")
  map("r", function() close(); require("player").pick_local() end, "Pick local audio")
  state.timer = (vim.uv or vim.loop).new_timer()
  state.timer:start(0, 850, vim.schedule_wrap(poll))
end

function M.close() close() end
return M
