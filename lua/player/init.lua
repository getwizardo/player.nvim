local M = {}
local config = require("player.config")
local mpv = require("player.mpv")
local queue, current = {}, 0

local function notify(text, level)
  vim.notify(text, level or vim.log.levels.INFO, { title = "player.nvim" })
end

local function valid_source(source)
  if type(source) ~= "string" or source == "" or source:match("^%s*$") or source:sub(1, 1) == "-" then return nil end
  local path = vim.fn.expand(source)
  if vim.fn.filereadable(path) == 1 then return vim.fn.fnamemodify(path, ":p") end
  if source:match("^[%a][%w+.-]*://") then return source end
  return nil
end

local function play_index(index)
  local source = queue[index]
  if not source then return end
  current = index
  mpv.play(source)
  notify("Playing " .. vim.fn.fnamemodify(source:gsub("[?#].*$", ""), ":t"))
end

function M.setup(options)
  config.setup(options)
  local maps = config.options.keymaps
  vim.keymap.set("n", maps.play_pause, M.toggle_pause, { desc = "Player: play/pause" })
  vim.keymap.set("n", maps.next, M.next, { desc = "Player: next" })
  vim.keymap.set("n", maps.previous, M.previous, { desc = "Player: previous" })
  vim.keymap.set("n", maps.lyrics, function() M.lyrics() end, { desc = "Player: lyrics" })
  return M
end

function M.play(source)
  local resolved = valid_source(source)
  if not resolved then
    notify("Not a readable local file or a URL: " .. tostring(source), vim.log.levels.ERROR)
    return
  end
  queue, current = { resolved }, 1
  play_index(1)
end

function M.add_to_queue(paths)
  local first_added
  for _, path in ipairs(paths) do
    local resolved = valid_source(path)
    if resolved then
      queue[#queue + 1] = resolved
      first_added = first_added or #queue
    end
  end
  if not first_added then notify("No playable files selected.", vim.log.levels.WARN); return end
  notify(string.format("Added %d track(s) to the queue.", #queue - first_added + 1))
  if current == 0 then play_index(first_added) end
end

function M.pick_local(append)
  local ok, telescope = pcall(require, "telescope.builtin")
  local pickers_ok, pickers = pcall(require, "telescope.pickers")
  local finders_ok, finders = pcall(require, "telescope.finders")
  local conf_ok, conf = pcall(require, "telescope.config")
  local actions_ok, actions = pcall(require, "telescope.actions")
  local action_state_ok, action_state = pcall(require, "telescope.actions.state")
  if config.options.use_telescope and ok and pickers_ok and finders_ok and conf_ok and actions_ok and action_state_ok then
    local cwd = vim.fn.getcwd()
    local cmd = vim.fn.executable("fd") == 1 and { "fd", "--type", "f", "--hidden", "--exclude", ".git" } or { "find", ".", "-type", "f" }
    pickers.new({}, {
      prompt_title = "Play local audio",
      finder = finders.new_oneshot_job(cmd, { cwd = cwd }),
      sorter = conf.values.file_sorter({}),
      attach_mappings = function(prompt_bufnr, map)
        local function select_entry(enqueue)
          local selection = action_state.get_selected_entry()
          actions.close(prompt_bufnr)
          if selection then
            local path = cwd .. "/" .. selection.value
            if enqueue then M.add_to_queue({ path }) else M.play(path) end
          end
        end
        map("i", "<CR>", function() select_entry(append == true) end)
        map("n", "<CR>", function() select_entry(append == true) end)
        if not append then
          map("i", "<C-q>", function() select_entry(true) end)
          map("n", "<C-q>", function() select_entry(true) end)
        end
        return true
      end,
    }):find()
    return
  end
  local files = vim.fn.globpath(vim.fn.getcwd(), "**/*", false, true)
  local audio, limit = {}, 500
  for _, path in ipairs(files) do
    if #audio >= limit then break end
    local extension = path:lower():match("%.([%w]+)$")
    local supported = { mp3 = true, m4a = true, aac = true, flac = true, wav = true, ogg = true, opus = true, wma = true, aiff = true, ape = true, alac = true, mp4 = true, webm = true, mkv = true }
    if vim.fn.filereadable(path) == 1 and supported[extension] then audio[#audio + 1] = path end
  end
  if #audio == 0 then notify("No audio files found under the current working directory.", vim.log.levels.WARN); return end
  vim.ui.select(audio, { prompt = append and "Queue local audio" or "Play local audio" }, function(path)
    if path then if append then M.add_to_queue({ path }) else M.play(path) end end
  end)
end

function M.toggle_pause() mpv.pause() end
function M.stop() mpv.stop() end
function M.next()
  if current < #queue then play_index(current + 1) else notify("End of queue.", vim.log.levels.WARN) end
end
function M.previous()
  if current > 1 then play_index(current - 1) else mpv.seek(0) end
end
function M._on_end_file(message)
  if message and message.reason == "eof" and current < #queue then play_index(current + 1) end
end
function M.shutdown() mpv.shutdown() end

local function parse_search_result(text)
  local ok, data = pcall(vim.json.decode, text)
  if not ok then return {} end
  local results = {}
  for _, item in ipairs(data.entries or {}) do
    local url = item.webpage_url or item.original_url or item.url
    if not url and item.id then url = "https://www.youtube.com/watch?v=" .. item.id end
    if url then
      results[#results + 1] = { title = item.title or item.fulltitle or item.id or "Untitled", uploader = item.uploader or item.channel or "", url = url, duration = item.duration }
    end
  end
  return results
end

function M.search(query)
  local function go(term)
    if not term or term == "" then return end
    if vim.fn.executable(config.options.yt_dlp) ~= 1 then notify("yt-dlp is required for search.", vim.log.levels.ERROR); return end
    notify("Searching yt-dlp…")
    vim.system({ config.options.yt_dlp, "--flat-playlist", "--dump-single-json", "--no-warnings", "ytsearch10:" .. term }, { text = true }, function(result)
      vim.schedule(function()
        if result.code ~= 0 then notify(result.stderr ~= "" and result.stderr or "yt-dlp search failed.", vim.log.levels.ERROR); return end
        local results = parse_search_result(result.stdout)
        if #results == 0 then notify("No search results.", vim.log.levels.WARN); return end
        vim.ui.select(results, {
          prompt = "yt-dlp results",
          format_item = function(item)
            local duration = item.duration and string.format(" [%d:%02d]", math.floor(item.duration / 60), math.floor(item.duration % 60)) or ""
            return item.title .. (item.uploader ~= "" and " — " .. item.uploader or "") .. duration
          end,
        }, function(item) if item then M.play(item.url) end end)
      end)
    end)
  end
  if query and query ~= "" then go(query) else vim.ui.input({ prompt = "Search tracks via yt-dlp: " }, go) end
end

function M.download(url)
  local function choose(source)
    if not source or source == "" then return end
    if not source:match("^https?://") then notify("Download expects an http(s) URL.", vim.log.levels.ERROR); return end
    if vim.fn.executable(config.options.yt_dlp) ~= 1 then notify("yt-dlp is required for downloads.", vim.log.levels.ERROR); return end
    vim.fn.mkdir(config.options.download_dir, "p")
    vim.system({ config.options.yt_dlp, "--extract-audio", "--audio-format", "best", "--no-playlist", "--output", "%(title)s.%(ext)s", "--paths", config.options.download_dir, source }, { text = true }, function(result)
      vim.schedule(function()
        if result.code == 0 then notify("Download complete: " .. config.options.download_dir)
        else notify(result.stderr ~= "" and result.stderr or "Download failed.", vim.log.levels.ERROR) end
      end)
    end)
  end
  if url and url ~= "" then choose(url) else vim.ui.input({ prompt = "URL to download audio from: " }, choose) end
end

local function configure_eq()
  vim.ui.input({ prompt = "10 EQ gains in dB, comma-separated (-12 to 12): ", default = table.concat(config.options.eq.bands, ",") }, function(value)
    if not value then return end
    local bands = {}
    for gain in value:gmatch("[^,]+") do
      local number = tonumber(vim.trim(gain))
      if not number or number < -12 or number > 12 then notify("Each EQ band must be between -12 and 12 dB.", vim.log.levels.ERROR); return end
      bands[#bands + 1] = number
    end
    if #bands ~= 10 then notify("Enter exactly ten comma-separated gains.", vim.log.levels.ERROR); return end
    config.options.eq.bands, config.options.eq.enabled = bands, true
    mpv.apply_audio()
    notify("Custom 10-band EQ enabled.")
  end)
end

function M.eq(arg)
  if arg == "off" then config.options.eq.enabled = false; mpv.apply_audio(); notify("EQ disabled."); return end
  if arg == "on" then config.options.eq.enabled = true; mpv.apply_audio(); notify("EQ enabled."); return end
  configure_eq()
end

local function configure_filter(kind)
  if not kind then return end
  if kind == "off" then config.options.filter.enabled = false; config.options.filter.type = "off"; mpv.apply_audio(); notify("Filter disabled."); return end
  if kind ~= "lowpass" and kind ~= "highpass" and kind ~= "bandpass" then
    notify("Filter must be lowpass, highpass, bandpass, or off.", vim.log.levels.ERROR)
    return
  end
  config.options.filter.type = kind
  vim.ui.input({ prompt = "Filter frequency (Hz): ", default = tostring(config.options.filter.frequency) }, function(value)
    if not value then return end
    local frequency = tonumber(value)
    if not frequency or frequency < 20 or frequency > 20000 then notify("Frequency must be from 20 to 20000 Hz.", vim.log.levels.ERROR); return end
    config.options.filter.frequency, config.options.filter.enabled = frequency, true
    if kind == "bandpass" then
      vim.ui.input({ prompt = "Band-pass Q width: ", default = tostring(config.options.filter.width) }, function(width)
        if not width then return end
        config.options.filter.width = tonumber(width) or 1
        mpv.apply_audio()
        notify("Band-pass filter enabled.")
      end)
    else
      mpv.apply_audio()
      notify(kind .. " filter enabled.")
    end
  end)
end

function M.filter(kind)
  if kind and kind ~= "" then configure_filter(kind); return end
  vim.ui.select({ "off", "lowpass", "highpass", "bandpass" }, { prompt = "Audio filter" }, configure_filter)
end

function M.lyrics(isrc) require("player.lyrics").show(isrc) end
function M.lyrics_search(query) require("player.lyrics").search(query) end
function M.jiosaavn(query) require("player.lyrics").search_jiosaavn(query) end
function M.translate(target) require("player.lyrics").translate(target) end
function M.visualize(enabled) mpv.visualize(enabled) end

function M.status()
  if not mpv.is_alive() then notify("Player is stopped."); return end
  mpv.property("media-title", function(title)
    mpv.property("time-pos", function(position)
      local time = type(position) == "number" and string.format("%d:%02d", math.floor(position / 60), math.floor(position % 60)) or "--:--"
      notify(string.format("%s  %s  ·  %d queued", title or "Playing", time, #queue))
    end)
  end)
end

function M.open(source)
  if source then M.play(source); return end
  require("player.ui").open()
end

return M
