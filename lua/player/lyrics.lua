local M = {}
local ns = vim.api.nvim_create_namespace("player.nvim.karaoke")
local active = { buf = nil, win = nil, timer = nil, rows = {}, metadata = {}, previous = 0, source = "" }

local function notify(message, level)
  vim.notify(message, level or vim.log.levels.INFO, { title = "player.nvim" })
end

local function decode_xml(text)
  text = text:gsub("&#x([%x]+);", function(hex) return vim.fn.nr2char(tonumber(hex, 16)) end)
  text = text:gsub("&#([0-9]+);", function(num) return vim.fn.nr2char(tonumber(num)) end)
  return text:gsub("&lt;", "<"):gsub("&gt;", ">"):gsub("&quot;", '"'):gsub("&apos;", "'"):gsub("&amp;", "&")
end

local function seconds(value)
  if not value then return 0 end
  local h, m, s = value:match("^(%d+):(%d+):(%d+%.?%d*)$")
  if h then return tonumber(h) * 3600 + tonumber(m) * 60 + tonumber(s) end
  local fh, fm, fs, frame = value:match("^(%d+):(%d+):(%d+):(%d+)$")
  if fh then return tonumber(fh) * 3600 + tonumber(fm) * 60 + tonumber(fs) + tonumber(frame) / 30 end
  local sec = value:match("^(%d+%.?%d*)s$")
  if sec then return tonumber(sec) end
  local ms = value:match("^(%d+%.?%d*)ms$")
  if ms then return tonumber(ms) / 1000 end
  local ticks = value:match("^(%d+%.?%d*)t$")
  if ticks then return tonumber(ticks) end
  return tonumber(value) or 0
end

local function attr(attrs, name)
  return attrs:match(name .. '%s*=%s*"([^"]*)"') or attrs:match(name .. "%s*=%s*'([^']*)'")
end

local function clean(text)
  text = text:gsub("<br%s*/?>", " "):gsub("<[^>]+>", " ")
  return decode_xml(text):gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
end

local function tag_blocks(xml, name)
  local result = {}
  for attrs, body in xml:gmatch("<" .. name .. "([^>]*)>(.-)</" .. name .. "%s*>") do
    result[#result + 1] = { attrs = attrs, body = body }
  end
  for attrs, body in xml:gmatch("<[%w_.-]+:" .. name .. "([^>]*)>(.-)</[%w_.-]+:" .. name .. "%s*>") do
    result[#result + 1] = { attrs = attrs, body = body }
  end
  return result
end

function M.parse_ttml(xml)
  local rows = {}
  for _, paragraph in ipairs(tag_blocks(xml, "p")) do
    local start = seconds(attr(paragraph.attrs, "begin"))
    local finish = seconds(attr(paragraph.attrs, "end"))
    local words = {}
    for _, span in ipairs(tag_blocks(paragraph.body, "span")) do
      local text = clean(span.body)
      local raw_start, raw_finish = seconds(attr(span.attrs, "begin")), seconds(attr(span.attrs, "end"))
      if text ~= "" and (attr(span.attrs, "begin") or attr(span.attrs, "end")) then
        words[#words + 1] = {
          start = raw_start > 0 and raw_start < start and start + raw_start or raw_start,
          finish = raw_finish > 0 and raw_finish < start and start + raw_finish or raw_finish,
          text = text,
        }
      end
    end
    table.sort(words, function(a, b) return a.start < b.start end)
    for index, word in ipairs(words) do
      if word.finish == 0 then word.finish = (words[index + 1] and words[index + 1].start) or finish end
    end
    local text = clean(paragraph.body)
    if text ~= "" then rows[#rows + 1] = { start = start, finish = finish, text = text, words = #words > 0 and words or nil } end
  end
  table.sort(rows, function(a, b) return a.start < b.start end)
  return rows
end

local function stop_timer()
  if active.timer then
    active.timer:stop()
    active.timer:close()
    active.timer = nil
  end
end

local function set_style()
  vim.api.nvim_set_hl(0, "PlayerSurface", { bg = "#17151d", fg = "#eeeaf2", default = true })
  vim.api.nvim_set_hl(0, "PlayerBorder", { fg = "#d85c86", bg = "#17151d", default = true })
  vim.api.nvim_set_hl(0, "PlayerEyebrow", { fg = "#e58ca5", bold = true, default = true })
  vim.api.nvim_set_hl(0, "PlayerMuted", { fg = "#aaa1b2", default = true })
  vim.api.nvim_set_hl(0, "PlayerLyricActive", { fg = "#fff7fb", bold = true, default = true })
  vim.api.nvim_set_hl(0, "PlayerKaraokeWord", { fg = "#ff7ba4", bold = true, underline = true, default = true })
  vim.api.nvim_set_hl(0, "PlayerTranslation", { fg = "#aaa1b2", italic = true, default = true })
end

local function render()
  if not (active.buf and vim.api.nvim_buf_is_valid(active.buf)) then return end
  local lines, lyric_rows = { "  NOW PLAYING  /  KARAOKE", "  " .. (active.metadata.title or "Lyrics"), "  " .. (active.metadata.artist or "") .. "  ·  " .. active.source, "" }, {}
  for _, item in ipairs(active.rows) do
    local prefix = item.start > 0 and string.format("  %02d:%02d   ", math.floor(item.start / 60), math.floor(item.start % 60)) or "  "
    lyric_rows[#lyric_rows + 1] = { buffer_row = #lines, text_column = #prefix, line = item }
    lines[#lines + 1] = prefix .. item.text
    if item.translation then
      lines[#lines + 1] = "           " .. item.translation
      lyric_rows[#lyric_rows].translation_row = #lines - 1
    end
  end
  if #active.rows == 0 then lines[#lines + 1] = "  No lyrics found for this track." end
  if vim.api.nvim_buf_is_valid(active.buf) then
    vim.bo[active.buf].modifiable = true
    vim.api.nvim_buf_set_lines(active.buf, 0, -1, false, lines)
    vim.bo[active.buf].modifiable = false
    vim.api.nvim_buf_clear_namespace(active.buf, ns, 0, -1)
  end
  active.display_rows = lyric_rows
  if active.win and vim.api.nvim_win_is_valid(active.win) then
    vim.api.nvim_win_set_config(active.win, {
      relative = "editor", width = math.max(24, math.min(78, vim.o.columns - 8)),
      height = math.max(8, math.min(vim.o.lines - 6, #lines + 1)),
      row = math.max(1, math.floor((vim.o.lines - math.min(vim.o.lines - 6, #lines + 1)) / 2)),
      col = math.max(1, math.floor((vim.o.columns - math.min(78, vim.o.columns - 8)) / 2)),
      border = "rounded", title = "  ♪  PLAYER  ", title_pos = "center",
    })
  end
end

local function draw_karaoke(position)
  if not (active.buf and vim.api.nvim_buf_is_valid(active.buf)) then stop_timer(); return end
  local has_timing = false
  for _, line in ipairs(active.rows) do if line.start > 0 or line.words then has_timing = true; break end end
  if not has_timing then return end
  local current = 0
  for i, line in ipairs(active.rows) do
    if line.start <= position then current = i else break end
  end
  local changed = current ~= active.previous
  active.previous = current
  vim.api.nvim_buf_clear_namespace(active.buf, ns, 0, -1)
  local display = active.display_rows and active.display_rows[current]
  if not display then return end
  vim.api.nvim_buf_set_extmark(active.buf, ns, display.buffer_row, 0, { line_hl_group = "PlayerLyricActive", priority = 110 })
  if display.translation_row then
    vim.api.nvim_buf_set_extmark(active.buf, ns, display.translation_row, 0, { line_hl_group = "PlayerTranslation", priority = 90 })
  end
  local line = display.line
  if line.words then
    local byte_cursor = 1
    for _, word in ipairs(line.words) do
      local at = line.text:find(word.text, byte_cursor, true)
      if at then
        if word.start <= position and (word.finish == 0 or word.finish >= position) then
          local start_col = display.text_column + at - 1
          local end_col = start_col + #word.text
          vim.api.nvim_buf_set_extmark(active.buf, ns, display.buffer_row, start_col, { end_row = display.buffer_row, end_col = end_col, hl_group = "PlayerKaraokeWord", priority = 180 })
        end
        byte_cursor = at + #word.text
      end
    end
  end
  if changed and require("player.config").options.lyric.follow and active.win and vim.api.nvim_win_is_valid(active.win) then
    pcall(vim.api.nvim_win_set_cursor, active.win, { display.buffer_row + 1, 0 })
    pcall(vim.api.nvim_win_call, active.win, function() vim.cmd("normal! zz") end)
  end
end

local function open(lines, metadata, source)
  stop_timer()
  if active.win and vim.api.nvim_win_is_valid(active.win) then pcall(vim.api.nvim_win_close, active.win, true) end
  active.win = nil
  set_style()
  active.rows, active.metadata, active.source, active.previous = lines or {}, metadata or {}, source or "Lyrics", 0
  active.buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_name(active.buf, "player://karaoke-" .. tostring((vim.uv or vim.loop).hrtime()))
  vim.bo[active.buf].buftype, vim.bo[active.buf].bufhidden, vim.bo[active.buf].swapfile = "nofile", "wipe", false
  vim.bo[active.buf].filetype = "playerlyrics"
  render()
  local max_width = math.max(24, math.min(78, vim.o.columns - 8))
  local height = math.max(8, math.min(vim.o.lines - 6, vim.api.nvim_buf_line_count(active.buf) + 1))
  local row, col = math.max(1, math.floor((vim.o.lines - height) / 2)), math.max(1, math.floor((vim.o.columns - max_width) / 2))
  active.win = vim.api.nvim_open_win(active.buf, true, {
    relative = "editor", width = max_width, height = height, row = row, col = col,
    style = "minimal", border = "rounded", title = "  ♪  PLAYER  ", title_pos = "center",
  })
  vim.wo[active.win].wrap = true
  vim.wo[active.win].winhl = "Normal:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow"
  vim.wo[active.win].cursorline = false
  vim.keymap.set("n", "q", function() M.close() end, { buffer = active.buf, silent = true, desc = "Close karaoke lyrics" })
  vim.keymap.set("n", "<Esc>", function() M.close() end, { buffer = active.buf, silent = true })
  vim.keymap.set("n", "t", function() M.translate() end, { buffer = active.buf, silent = true, desc = "Translate lyrics" })
  vim.keymap.set("n", "f", function() local o = require("player.config").options; o.lyric.follow = not o.lyric.follow; notify("Karaoke follow " .. (o.lyric.follow and "on" or "off")) end, { buffer = active.buf, silent = true, desc = "Toggle lyric follow" })
  active.timer = (vim.uv or vim.loop).new_timer()
  active.timer:start(0, 180, vim.schedule_wrap(function()
    require("player.mpv").property("time-pos", function(position) if type(position) == "number" then draw_karaoke(position) end end)
  end))
end

local function plugin_root()
  local source = debug.getinfo(1, "S").source:sub(2)
  return vim.fn.fnamemodify(source, ":p:h:h:h")
end

local function helper_call(args, stdin, callback, env)
  local options = require("player.config").options
  local script = plugin_root() .. "/dist/lyrics.js"
  if vim.fn.executable(options.node) ~= 1 or vim.fn.filereadable(script) ~= 1 then
    callback(nil, "Lyrics search/translation needs Node.js and the compiled dist/lyrics.js helper.")
    return
  end
  local system_options = { text = true, stdin = stdin }
  if env then system_options.env = env end
  vim.system(vim.list_extend({ options.node, script }, args), system_options, function(result)
    vim.schedule(function()
      if result.code ~= 0 then callback(nil, result.stderr ~= "" and result.stderr or "Lyrics helper failed."); return end
      local ok, value = pcall(vim.json.decode, result.stdout)
      if not ok then callback(nil, "Could not decode lyrics helper response."); return end
      callback(value)
    end)
  end)
end

function M.fetch(isrc, callback)
  isrc = (isrc or ""):upper():gsub("%s+", "")
  if not isrc:match("^[A-Z][A-Z][A-Z0-9][A-Z0-9][A-Z0-9]%d%d%d%d%d%d%d$") then
    callback(nil, "Enter a valid 12-character ISRC (for example, GBUM71029604).")
    return
  end
  local options = require("player.config").options
  local helper = plugin_root() .. "/dist/lyrics.js"
  if vim.fn.executable(options.node) == 1 and vim.fn.filereadable(helper) == 1 then
    helper_call({ "ttml", isrc }, nil, callback)
    return
  end
  vim.system({ "curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "20", "https://lrc.red/s/" .. isrc .. ".ttml" }, { text = true }, function(result)
    vim.schedule(function()
      if result.code ~= 0 then callback(nil, result.stderr ~= "" and result.stderr or "Could not fetch TTML from lrc.red."); return end
      callback(M.parse_ttml(result.stdout))
    end)
  end)
end

local function display_candidates(candidates)
  if type(candidates) ~= "table" or #candidates == 0 then notify("No lyric matches found.", vim.log.levels.WARN); return end
  local choices = {}
  for _, candidate in ipairs(candidates) do
    if candidate.hasLyrics ~= false then choices[#choices + 1] = candidate end
  end
  if #choices == 0 then notify("Matches were found, but none advertise lyrics.", vim.log.levels.WARN); return end
  vim.ui.select(choices, {
    prompt = "Lyrics search · LRCLIB + JioSaavn catalog",
    format_item = function(item)
      local detail = item.artist .. (item.album ~= "" and " · " .. item.album or "")
      return string.format("[%s] %s — %s", item.provider, item.title, detail)
    end,
  }, function(candidate)
    if not candidate then return end
    helper_call({ "lyrics", vim.json.encode(candidate) }, nil, function(result, err)
      if not result then notify("Lyrics: " .. tostring(err), vim.log.levels.WARN); return end
      local selected = result.candidate or candidate
      open(result.lines or {}, { title = selected.title, artist = selected.artist, album = selected.album }, result.source or selected.provider)
    end)
  end)
end

function M.search(query)
  local function go(text)
    if not text or text == "" then return end
    helper_call({ "search", text }, nil, function(result, err)
      if not result then notify("Lyrics search: " .. tostring(err), vim.log.levels.ERROR); return end
      display_candidates(result)
    end, { PLAYER_JIOSAAVN_API = require("player.config").options.jiosaavn_api })
  end
  if query and query ~= "" then go(query) else vim.ui.input({ prompt = "Search lyrics by song, artist, or phrase: " }, go) end
end

function M.search_jiosaavn(query)
  local function go(text)
    if not text or text == "" then return end
    helper_call({ "search", text }, nil, function(result, err)
      if not result then notify("JioSaavn search: " .. tostring(err), vim.log.levels.ERROR); return end
      local songs = {}
      for _, candidate in ipairs(result) do if candidate.provider == "JioSaavn" then songs[#songs + 1] = candidate end end
      if #songs == 0 then notify("No JioSaavn songs found.", vim.log.levels.WARN); return end
      vim.ui.select(songs, {
        prompt = "JioSaavn · unofficial catalog search",
        format_item = function(item) return item.title .. " — " .. item.artist .. (item.language and " · " .. item.language or "") end,
      }, function(song) if song and song.url then require("player").play(song.url) end end)
    end, { PLAYER_JIOSAAVN_API = require("player.config").options.jiosaavn_api })
  end
  if query and query ~= "" then go(query) else vim.ui.input({ prompt = "Search JioSaavn: " }, go) end
end

function M.translate(target)
  if not active.rows or #active.rows == 0 then notify("Open lyrics before translating.", vim.log.levels.WARN); return end
  local function translate_to(language)
    if not language or language == "" then return end
    local translator = require("player.config").options.translator
    helper_call({ "translate", language, translator.source or "auto" }, vim.json.encode(active.rows), function(translations, err)
      if not translations then notify("Translation: " .. tostring(err), vim.log.levels.ERROR); return end
      for index, line in ipairs(active.rows) do line.translation = translations[index] end
      active.previous = 0
      render()
      notify("Lyrics translated to " .. language .. ".")
    end, { PLAYER_TRANSLATE_URL = translator.url, PLAYER_TRANSLATE_API_KEY = translator.api_key })
  end
  if target and target ~= "" then translate_to(target)
  else vim.ui.input({ prompt = "Target language code (e.g. en, vi, hi, ja): ", default = "en" }, translate_to) end
end

function M.show(isrc)
  local function go(value)
    if not value or value == "" then return end
    M.fetch(value, function(rows, err)
      if not rows then notify("Lyrics: " .. tostring(err), vim.log.levels.WARN); return end
      if #rows == 0 then notify("No timed lines found for that ISRC.", vim.log.levels.WARN); return end
      open(rows, { title = "ISRC " .. value }, "lrc.red · TTML")
    end)
  end
  if isrc and isrc ~= "" then go(isrc); return end
  require("player.mpv").property("metadata/by-key/ISRC", function(metadata_isrc)
    if metadata_isrc and metadata_isrc ~= "" then go(metadata_isrc)
    else vim.ui.input({ prompt = "ISRC for lrc.red TTML lyrics: " }, go) end
  end)
end

function M.close()
  stop_timer()
  if active.win and vim.api.nvim_win_is_valid(active.win) then pcall(vim.api.nvim_win_close, active.win, true) end
  active.win, active.buf, active.rows, active.display_rows = nil, nil, {}, {}
end

return M
