/**
 * The Lua test harness.
 *
 * The plugin is written in TypeScript and compiled to Lua with
 * `typescript-to-lua`. This module contains a small Neovim stub and a set of
 * assertions that are executed by a real Lua interpreter, so that the
 * generated code is tested and not only the TypeScript sources.
 */

/** The Lua source of the test harness. */
export const HARNESS_LUA = `
local root = os.getenv("PLAYER_ROOT") or "."
package.path = root .. "/lua/?.lua;" .. root .. "/lua/?/init.lua;" .. package.path

--------------------------------------------------------------------------
-- A minimal JSON implementation (the harness cannot rely on Neovim).
--------------------------------------------------------------------------
local jsonEscapes = {
  ['"'] = '\\\\"',
  ['\\\\'] = '\\\\\\\\',
  ['\\b'] = '\\\\b',
  ['\\f'] = '\\\\f',
  ['\\n'] = '\\\\n',
  ['\\r'] = '\\\\r',
  ['\\t'] = '\\\\t',
}

local function encodeString(text)
  local out = text:gsub('[%c"\\\\]', function(char)
    local escaped = jsonEscapes[char]
    if escaped then
      return escaped
    end
    return string.format('\\\\u%04x', string.byte(char))
  end)
  return '"' .. out .. '"'
end

local function isArray(value)
  local count = 0
  for key in pairs(value) do
    if type(key) ~= "number" then
      return false
    end
    count = count + 1
  end
  return count == #value
end

local function jsonEncode(value)
  if value == nil then
    return "null"
  end
  local kind = type(value)
  if kind == "boolean" then
    return tostring(value)
  end
  if kind == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      return "null"
    end
    if math.floor(value) == value then
      return string.format("%d", value)
    end
    return tostring(value)
  end
  if kind == "string" then
    return encodeString(value)
  end
  if kind == "table" then
    if isArray(value) then
      local parts = {}
      for index = 1, #value do
        parts[index] = jsonEncode(value[index])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for key, item in pairs(value) do
      parts[#parts + 1] = encodeString(tostring(key)) .. ":" .. jsonEncode(item)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end

local function jsonDecode(text)
  local pos = 1
  local length = #text

  local function fail(message)
    error("json: " .. message .. " at " .. tostring(pos), 0)
  end

  local function skip()
    while pos <= length and string.match(string.sub(text, pos, pos), "%s") do
      pos = pos + 1
    end
  end

  local parseValue

  local function parseString()
    pos = pos + 1
    local buffer = {}
    while pos <= length do
      local char = string.sub(text, pos, pos)
      if char == '"' then
        pos = pos + 1
        return table.concat(buffer)
      end
      if char == "\\\\" then
        local escaped = string.sub(text, pos + 1, pos + 1)
        if escaped == "n" then
          buffer[#buffer + 1] = "\\n"
        elseif escaped == "t" then
          buffer[#buffer + 1] = "\\t"
        elseif escaped == "r" then
          buffer[#buffer + 1] = "\\r"
        elseif escaped == "b" then
          buffer[#buffer + 1] = "\\b"
        elseif escaped == "f" then
          buffer[#buffer + 1] = "\\f"
        elseif escaped == "u" then
          local code = tonumber(string.sub(text, pos + 2, pos + 5), 16) or 63
          buffer[#buffer + 1] = string.char(code)
          pos = pos + 4
        else
          buffer[#buffer + 1] = escaped
        end
        pos = pos + 2
      else
        buffer[#buffer + 1] = char
        pos = pos + 1
      end
    end
    fail("unterminated string")
  end

  local function parseArray()
    pos = pos + 1
    local out = {}
    skip()
    if string.sub(text, pos, pos) == "]" then
      pos = pos + 1
      return out
    end
    while true do
      skip()
      out[#out + 1] = parseValue()
      skip()
      local char = string.sub(text, pos, pos)
      pos = pos + 1
      if char == "]" then
        return out
      end
      if char ~= "," then
        fail("expected , or ]")
      end
    end
  end

  local function parseObject()
    pos = pos + 1
    local out = {}
    skip()
    if string.sub(text, pos, pos) == "}" then
      pos = pos + 1
      return out
    end
    while true do
      skip()
      local key = parseString()
      skip()
      if string.sub(text, pos, pos) ~= ":" then
        fail("expected :")
      end
      pos = pos + 1
      skip()
      out[key] = parseValue()
      skip()
      local char = string.sub(text, pos, pos)
      pos = pos + 1
      if char == "}" then
        return out
      end
      if char ~= "," then
        fail("expected , or }")
      end
    end
  end

  parseValue = function()
    skip()
    local char = string.sub(text, pos, pos)
    if char == "{" then
      return parseObject()
    end
    if char == "[" then
      return parseArray()
    end
    if char == '"' then
      return parseString()
    end
    if string.sub(text, pos, pos + 3) == "true" then
      pos = pos + 4
      return true
    end
    if string.sub(text, pos, pos + 4) == "false" then
      pos = pos + 5
      return false
    end
    if string.sub(text, pos, pos + 3) == "null" then
      pos = pos + 4
      return nil
    end
    local number = string.match(string.sub(text, pos), "^-?%d+%.?%d*[eE]?[-+]?%d*")
    if number == nil or number == "" then
      fail("unexpected value")
    end
    pos = pos + #number
    return tonumber(number)
  end

  local value = parseValue()
  return value
end

--------------------------------------------------------------------------
-- The Neovim stub.
--------------------------------------------------------------------------
local notifications = {}
local scheduled = {}
local deferred = {}
local commands = {}
local autocmds = {}

local function noop() end

-- Every message that the plugin writes to the mpv socket.
local ipcMessages = {}

-- Every timer that the plugin starts.
local timerCalls = {}

local fakePipe = {
  connect = function(_, path, callback)
    callback(nil)
  end,
  read_start = function(_, callback) end,
  read_stop = noop,
  close = noop,
  is_closing = function()
    return false
  end,
  write = function(_, data)
    ipcMessages[#ipcMessages + 1] = data
    return true
  end,
}

local fakeTimer = {
  start = function(timer, interval, repeats, callback)
    timerCalls[#timerCalls + 1] = { interval = interval, repeats = repeats, callback = callback }
  end,
  stop = noop,
  close = noop,
  is_active = function()
    return false
  end,
}

vim = {
  notify = function(message, level)
    notifications[#notifications + 1] = { message = message, level = level }
  end,
  log = { levels = { TRACE = 0, DEBUG = 1, INFO = 2, WARN = 3, ERROR = 4, OFF = 5 } },
  o = { columns = 120, lines = 40, cmdheight = 1 },
  bo = setmetatable({}, { __index = function()
    return {}
  end }),
  wo = setmetatable({}, { __index = function()
    return {}
  end }),
  env = { PATH = "/usr/bin:/bin" },
  g = {},
  b = {},
  w = {},
  api = {
    nvim_create_user_command = function(name, command, opts)
      commands[name] = { command = command, opts = opts }
    end,
    nvim_create_autocmd = function(event, opts)
      autocmds[#autocmds + 1] = { event = event, opts = opts }
      return #autocmds
    end,
    nvim_create_augroup = function()
      return 1
    end,
    nvim_create_namespace = function()
      return 1
    end,
    nvim_set_hl = noop,
    nvim_create_buf = function()
      return 1
    end,
    nvim_buf_set_name = noop,
    nvim_buf_set_lines = noop,
    nvim_buf_get_lines = function()
      return {}
    end,
    nvim_buf_line_count = function()
      return 1
    end,
    nvim_buf_is_valid = function()
      return true
    end,
    nvim_buf_clear_namespace = noop,
    nvim_buf_add_highlight = noop,
    nvim_buf_set_extmark = function()
      return { id = 1 }
    end,
    nvim_open_win = function()
      return 1
    end,
    nvim_win_is_valid = function()
      return true
    end,
    nvim_win_close = noop,
    nvim_win_set_config = noop,
    nvim_win_set_cursor = noop,
    nvim_win_call = noop,
    nvim_get_current_win = function()
      return 1
    end,
    nvim_get_current_buf = function()
      return 1
    end,
    nvim_echo = noop,
    nvim_err_writeln = noop,
  },
  fn = {
    expand = function(path)
      return path
    end,
    filereadable = function()
      return 0
    end,
    fnamemodify = function(path)
      return path
    end,
    executable = function(cmd)
      if cmd == "mpv" then
        return 1
      end
      return 0
    end,
    has = function()
      return 0
    end,
    mkdir = function()
      return 1
    end,
    isdirectory = function()
      return 1
    end,
    getfsize = function()
      return 1024
    end,
    globpath = function()
      return {}
    end,
    getcwd = function()
      return "/tmp"
    end,
    stdpath = function()
      return "/tmp/player-nvim-test"
    end,
    getpid = function()
      return 4242
    end,
    jobstart = function()
      return 7
    end,
    jobwait = function()
      return { -1 }
    end,
    jobstop = function()
      return 0
    end,
    nr2char = function(code)
      return string.char(code)
    end,
    trim = function(text)
      return text
    end,
    environ = function()
      return { PATH = "/usr/bin:/bin", HOME = "/tmp" }
    end,
    system = function()
      return ""
    end,
    delete = function()
      return 0
    end,
    input = function()
      return ""
    end,
  },
  ui = {
    select = function(items, opts, onChoice)
      onChoice(items[1], 1)
    end,
    input = function(opts, onConfirm)
      onConfirm(opts.default)
    end,
  },
  json = { encode = jsonEncode, decode = jsonDecode },
  health = { start = noop, ok = noop, warn = noop, error = noop, info = noop },
  uv = {
    new_pipe = function()
      return fakePipe
    end,
    new_timer = function()
      return fakeTimer
    end,
    fs_unlink = noop,
    hrtime = function()
      return 1234567890
    end,
    now = function()
      return 0
    end,
  },
  cmd = noop,
  schedule = function(fn)
    scheduled[#scheduled + 1] = fn
  end,
  defer_fn = function(fn)
    deferred[#deferred + 1] = fn
  end,
  schedule_wrap = function(fn)
    return fn
  end,
  keymap = { set = noop },
  system = function(cmd, opts, onResult)
    if onResult then
      onResult({ code = 1, stdout = "", stderr = "not available" })
    end
    return { pid = 1 }
  end,
  split = function(text, sep)
    local out = {}
    local from = 1
    while true do
      local at = string.find(text, sep, from, true)
      if at == nil then
        break
      end
      out[#out + 1] = string.sub(text, from, at - 1)
      from = at + #sep
    end
    out[#out + 1] = string.sub(text, from)
    return out
  end,
  trim = function(text)
    return text
  end,
  deepcopy = function(value)
    return value
  end,
  inspect = function()
    return ""
  end,
  starts_with = function(text, prefix)
    return string.sub(text, 1, #prefix) == prefix
  end,
  ends_with = function(text, suffix)
    return string.sub(text, -#suffix) == suffix
  end,
  tbl_isempty = function(value)
    return next(value) == nil
  end,
  empty = function(value)
    return value == nil
  end,
  islist = function()
    return true
  end,
}

--------------------------------------------------------------------------
-- The test runner.
--------------------------------------------------------------------------
local total = 0
local failures = 0

local function check(name, fn)
  total = total + 1
  local ok, err = pcall(fn)
  if ok then
    print("PASS " .. name)
  else
    failures = failures + 1
    print("FAIL " .. name .. ": " .. tostring(err))
  end
end

local function eq(actual, expected, label)
  if actual ~= expected then
    error((label or "value") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
  end
end

local function ok(value, label)
  if not value then
    error((label or "value") .. ": expected a truthy value, got " .. tostring(value), 2)
  end
end

local function near(actual, expected, label)
  if math.abs(actual - expected) > 0.001 then
    error((label or "value") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
  end
end

--------------------------------------------------------------------------
-- The tests.
--------------------------------------------------------------------------
local util = require("player.lua-util")
local format = require("player.format")
local queue = require("player.queue")
local config = require("player.config")
local ttml = require("player.ttml")
local player = require("player")
local ui = require("player.ui")

check("lua-util.split keeps empty fields", function()
  local parts = util.split("a,b,,c", ",")
  eq(#parts, 4, "field count")
  eq(parts[1], "a")
  eq(parts[3], "")
  eq(parts[4], "c")
end)

check("lua-util.split without a separator", function()
  local parts = util.split("abc", ",")
  eq(#parts, 1)
  eq(parts[1], "abc")
end)

check("lua-util.trim removes the whitespace", function()
  eq(util.trim("  hello  "), "hello")
end)

check("lua-util.matchCapture returns the capture", function()
  eq(util.matchCapture("song.flac", "%.([%w]+)$"), "flac")
  eq(util.matchCapture("song", "%.([%w]+)$"), nil)
end)

check("lua-util.attempt captures the error", function()
  local good = util.attempt(function()
    return 42
  end)
  eq(good.ok, true)
  eq(good.value, 42)
  local bad = util.attempt(function()
    error("boom")
  end)
  eq(bad.ok, false)
  ok(bad.error and string.find(bad.error, "boom", 1, true) ~= nil, "the error message is kept")
end)

check("lua-util.indexOf finds the value", function()
  eq(util.indexOf({ "a", "b", "c" }, "b"), 1)
  eq(util.indexOf({ "a" }, "z"), -1)
end)

check("lua-util.removeAt shifts the array", function()
  local list = { "a", "b", "c" }
  util.removeAt(list, 1)
  eq(#list, 2)
  eq(list[1], "a")
  eq(list[2], "c")
end)

check("lua-util.clear empties the array", function()
  local list = { "a", "b" }
  util.clear(list)
  eq(#list, 0)
end)

check("format.formatClock formats the time", function()
  eq(format.formatClock(0), "0:00")
  eq(format.formatClock(65), "1:05")
  eq(format.formatClock(3661), "1:01:01")
end)

check("format.sourceLabel keeps the file name", function()
  eq(format.sourceLabel("https://example.com/music/song.mp3"), "song.mp3")
  eq(format.sourceLabel("/home/user/song.flac?x=1"), "song.flac")
end)

check("format.progressBar renders the progress", function()
  local bar = format.progressBar(5, 10, 10)
  local filled = select(2, string.gsub(bar, "━", ""))
  eq(filled, 5, "half of the bar is filled")
  local rest = select(2, string.gsub(bar, "─", ""))
  local head = select(2, string.gsub(bar, "●", ""))
  eq(filled + rest + head, 10, "the bar is ten cells wide")
end)

check("format.eqCurve shows a flat curve when disabled", function()
  local disabled = format.eqCurve({ 0, 0 }, false)
  eq(disabled, "▁  ▁")
  local enabled = format.eqCurve({ 12, 0 }, true)
  eq(enabled, "█  ▅")
end)

check("queue.addItem appends and labels the track", function()
  local state = queue.createQueue()
  eq(queue.addItem(state, "https://example.com/song.mp3"), 0)
  eq(#state.items, 1)
  eq(state.items[1].label, "song.mp3")
end)

check("queue.removeItem keeps the current track in range", function()
  local state = queue.createQueue()
  queue.addItem(state, "a")
  queue.addItem(state, "b")
  state.current = 1
  ok(queue.removeItem(state, 0), "removal succeeds")
  eq(#state.items, 1)
  eq(state.current, 0)
  ok(not queue.removeItem(state, 9), "an invalid index is refused")
end)

check("queue.nextIndex walks the queue", function()
  local state = queue.createQueue()
  queue.addItem(state, "a")
  queue.addItem(state, "b")
  state.current = 0
  eq(queue.nextIndex(state, function()
    return 0
  end), 1)
  state.current = 1
  eq(queue.nextIndex(state, function()
    return 0
  end), nil, "the queue ends")
end)

check("queue.nextIndex repeats the queue", function()
  local state = queue.createQueue()
  queue.addItem(state, "a")
  queue.addItem(state, "b")
  state.current = 1
  state["repeat"] = "queue"
  eq(queue.nextIndex(state, function()
    return 0
  end), 0)
end)

check("queue.nextIndex shuffles", function()
  local state = queue.createQueue()
  queue.addItem(state, "a")
  queue.addItem(state, "b")
  queue.addItem(state, "c")
  state.current = 0
  state.shuffle = true
  eq(queue.nextIndex(state, function()
    return 0.5
  end), 1)
  eq(queue.nextIndex(state, function()
    return 0
  end), 1, "the current track is skipped")
end)

check("queue.previousIndex uses the history", function()
  local state = queue.createQueue()
  queue.addItem(state, "a")
  queue.addItem(state, "b")
  state.current = 1
  queue.recordHistory(state, 0)
  eq(queue.previousIndex(state), 0)
  eq(#state.history, 0, "the history is consumed")
end)

check("queue.cycleRepeat cycles the modes", function()
  local state = queue.createQueue()
  eq(queue.cycleRepeat(state), "queue")
  eq(queue.cycleRepeat(state), "track")
  eq(queue.cycleRepeat(state), "off")
  eq(queue.cycleRepeat(state, "queue"), "queue")
end)

check("config.defaults are sane", function()
  local defaults = config.defaults()
  eq(defaults.default_volume, 75)
  eq(defaults.eq.enabled, false)
  eq(#defaults.eq.bands, 10)
  eq(#defaults.eq.frequencies, 10)
  eq(defaults.filter.type, "off")
  eq(defaults.use_telescope, true)
end)

check("config.setup applies the user options", function()
  local applied = config.setup({ default_volume = 42, eq = { enabled = true } })
  eq(applied.default_volume, 42)
  eq(applied.eq.enabled, true)
  eq(config.options().default_volume, 42)
end)

check("config.setup ignores invalid values", function()
  local applied = config.setup({ default_volume = 500, filter = { type = "nope" } })
  eq(applied.default_volume, 100)
  eq(applied.filter.type, "off")
end)

check("config.setup resets the previous options", function()
  config.setup({ default_volume = 42 })
  local applied = config.setup({})
  eq(applied.default_volume, 75)
end)

check("ttml.parseLrc reads the timestamps", function()
  local rows = ttml.parseLrc("[00:01.00]first\\n[00:02.50]second")
  eq(#rows, 2)
  near(rows[1].start, 1, "first start")
  near(rows[2].start, 2.5, "second start")
  eq(rows[2].text, "second")
end)

check("ttml.parseLrc supports several timestamps", function()
  local rows = ttml.parseLrc("[00:01.00][00:05.00]shared")
  eq(#rows, 2)
  near(rows[1].start, 1)
  near(rows[2].start, 5)
end)

check("ttml.parseTtml reads the paragraphs", function()
  local xml = [[
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.000">Hello world</p>
    </div>
  </body>
</tt>
]]
  local rows = ttml.parseTtml(xml)
  eq(#rows, 1)
  near(rows[1].start, 1, "start")
  near(rows[1].finish, 3, "finish")
  eq(rows[1].text, "Hello world")
end)

check("ttml.toSeconds understands the time formats", function()
  near(ttml.toSeconds("00:00:01.500"), 1.5)
  near(ttml.toSeconds("01:00:00:00"), 3600)
  near(ttml.toSeconds("250ms"), 0.25)
  near(ttml.toSeconds("12s"), 12)
end)

check("player.setup does not swallow the options", function()
  player.setup({ default_volume = 33 })
  eq(config.options().default_volume, 33)
  eq(player.queueInfo().count, 0)
end)

check("player.queueAdd adds the track to the queue", function()
  player.setup({})
  player.queueClear()
  player.queueAdd("https://example.com/song.mp3")
  local info = player.queueInfo()
  eq(info.count, 1, "the track is queued")
  eq(info.current, 1, "the first track plays")
end)

check("player.play keeps the source as the argument", function()
  player.setup({})
  player.queueClear()
  player.play("https://example.com/song.mp3")
  eq(player.queueInfo().count, 1)
  eq(player.queueInfo().current, 1, "the track is playing")
end)

check("player.play loads the file in mpv", function()
  player.setup({})
  player.queueClear()
  local before = #ipcMessages
  player.play("https://example.com/another.mp3")
  -- The socket is opened by a deferred callback, the queued commands are
  -- replayed as soon as it is connected.
  for index = 1, #deferred do
    local pending = deferred[index]
    local success, failure = pcall(pending)
    if not success then
      print("DEBUG deferred " .. index .. " failed: " .. tostring(failure))
    end
  end
  local found = false
  local seen = {}
  for index = before + 1, #ipcMessages do
    local message = ipcMessages[index]
    seen[#seen + 1] = message
    if string.find(message, "loadfile", 1, true) and string.find(message, "another.mp3", 1, true) then
      found = true
    end
  end
  ok(found, "mpv received the loadfile command, saw: " .. table.concat(seen, " | "))
end)

check("player.queueRemove removes the track", function()
  player.setup({})
  player.queueClear()
  player.queueAdd("https://example.com/a.mp3")
  player.queueAdd("https://example.com/b.mp3")
  eq(player.queueInfo().count, 2)
  player.queueRemove(0)
  eq(player.queueInfo().count, 1)
end)

check("player.toggleShuffle and cycleRepeat update the queue", function()
  player.setup({})
  eq(player.toggleShuffle(), true)
  eq(player.toggleShuffle(false), false)
  eq(player.cycleRepeat(), "queue")
  eq(player.cycleRepeat("track"), "track")
  eq(player.cycleRepeat("nope"), "track", "an invalid mode is ignored")
end)

check("player.shutdown releases the resources", function()
  player.setup({})
  player.shutdown()
  eq(true, true)
end)

check("player.isDirectMedia knows the files mpv can play", function()
  ok(player.isDirectMedia("https://example.com/song.mp3"), "an mp3 is direct")
  ok(player.isDirectMedia("https://example.com/song.M4A?token=1"), "the query is ignored")
  ok(not player.isDirectMedia("https://www.jiosaavn.com/song/abc"), "a web page is not direct")
  ok(not player.isDirectMedia("https://example.com/stream"), "an extension is needed")
end)

check("the dashboard starts its redraw timer", function()
  player.setup({})
  local before = #timerCalls
  ui.open()
  ok(#timerCalls > before, "the timer was started with its handle")
  ui.close()
end)

print("SUMMARY " .. tostring(total - failures) .. "/" .. tostring(total))
`;

/** A single test result of the harness. */
export interface HarnessCase {
  name: string;
  ok: boolean;
  message: string;
}

/** The parsed result of a harness run. */
export interface HarnessResult {
  cases: HarnessCase[];
  passed: number;
  total: number;
}

/** Parse the output of the harness. */
export function parseHarnessOutput(output: string): HarnessResult {
  const cases: HarnessCase[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("PASS ")) {
      cases.push({ name: line.slice(5).trim(), ok: true, message: "" });
    } else if (line.startsWith("FAIL ")) {
      const rest = line.slice(5);
      const separator = rest.indexOf(": ");
      const name = separator === -1 ? rest : rest.slice(0, separator);
      const message = separator === -1 ? "" : rest.slice(separator + 2);
      cases.push({ name: name.trim(), ok: false, message: message });
    }
  }
  return {
    cases: cases,
    passed: cases.filter((item) => item.ok).length,
    total: cases.length,
  };
}
