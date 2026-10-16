--[[
A Neovim stand-in for running the compiled plugin under LuaJIT.

Neovim itself cannot be installed in this environment, so the tests drive the
*generated* Lua modules against this shim. It implements only what the plugin
actually touches:

  vim.json          a real JSON codec (objects, arrays, strings, escapes)
  vim.system        runs the real command with io.popen, so curl really runs
  vim.schedule      calls back immediately (tests are synchronous)
  vim.uv            timers that only start when a test ticks them
  vim.api           records extmarks/floats instead of drawing them
  vim.fn.jobstart   captures the callbacks so mpv's framing can be exercised
]]

local json = {}

-- ------------------------------------------------------------------ decode
local function decode_error(text, pos, message)
  error(string.format("json decode error at %d: %s (near %q)", pos or 0, message, string.sub(text, pos or 1, (pos or 1) + 20)))
end

local decode_value

local function skip_space(text, pos)
  local byte = string.byte(text, pos)
  while byte == 32 or byte == 9 or byte == 10 or byte == 13 do
    pos = pos + 1
    byte = string.byte(text, pos)
  end
  return pos
end

local escapes = { ['"'] = '"', ["\\"] = "\\", ["/"] = "/", b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }

local function utf8_from_codepoint(code)
  if code < 0x80 then
    return string.char(code)
  elseif code < 0x800 then
    return string.char(0xc0 + math.floor(code / 64), 0x80 + code % 64)
  elseif code < 0x10000 then
    return string.char(0xe0 + math.floor(code / 4096), 0x80 + math.floor(code / 64) % 64, 0x80 + code % 64)
  end
  return string.char(
    0xf0 + math.floor(code / 262144),
    0x80 + math.floor(code / 4096) % 64,
    0x80 + math.floor(code / 64) % 64,
    0x80 + code % 64
  )
end

local function decode_string(text, pos)
  -- pos points at the opening quote
  local out = {}
  pos = pos + 1
  while true do
    local char = string.sub(text, pos, pos)
    if char == "" then
      decode_error(text, pos, "unterminated string")
    end
    if char == '"' then
      return table.concat(out), pos + 1
    end
    if char == "\\" then
      local escape = string.sub(text, pos + 1, pos + 1)
      local replacement = escapes[escape]
      if replacement then
        out[#out + 1] = replacement
        pos = pos + 2
      elseif escape == "u" then
        local hex = string.sub(text, pos + 2, pos + 5)
        local code = tonumber(hex, 16)
        if not code then decode_error(text, pos, "bad \\u escape") end
        if code >= 0xd800 and code <= 0xdbff then
          local low = tonumber(string.sub(text, pos + 8, pos + 11), 16)
          if string.sub(text, pos + 6, pos + 7) == "\\u" and low then
            code = (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000
            pos = pos + 12
          else
            pos = pos + 6
          end
        else
          pos = pos + 6
        end
        out[#out + 1] = utf8_from_codepoint(code)
      else
        decode_error(text, pos, "unknown escape \\" .. escape)
      end
    else
      out[#out + 1] = char
      pos = pos + 1
    end
  end
end

local function decode_object(text, pos)
  local object = {}
  pos = skip_space(text, pos + 1)
  if string.sub(text, pos, pos) == "}" then
    return object, pos + 1
  end
  while true do
    pos = skip_space(text, pos)
    if string.sub(text, pos, pos) ~= '"' then decode_error(text, pos, "expected object key") end
    local key
    key, pos = decode_string(text, pos)
    pos = skip_space(text, pos)
    if string.sub(text, pos, pos) ~= ":" then decode_error(text, pos, "expected ':'") end
    local value
    value, pos = decode_value(text, pos + 1)
    object[key] = value
    pos = skip_space(text, pos)
    local char = string.sub(text, pos, pos)
    if char == "," then
      pos = pos + 1
    elseif char == "}" then
      return object, pos + 1
    else
      decode_error(text, pos, "expected ',' or '}'")
    end
  end
end

local function decode_array(text, pos)
  local array = {}
  pos = skip_space(text, pos + 1)
  if string.sub(text, pos, pos) == "]" then
    return array, pos + 1
  end
  while true do
    local value
    value, pos = decode_value(text, pos)
    array[#array + 1] = value
    pos = skip_space(text, pos)
    local char = string.sub(text, pos, pos)
    if char == "," then
      pos = pos + 1
    elseif char == "]" then
      return array, pos + 1
    else
      decode_error(text, pos, "expected ',' or ']'")
    end
  end
end

decode_value = function(text, pos)
  pos = skip_space(text, pos)
  local char = string.sub(text, pos, pos)
  if char == "{" then
    return decode_object(text, pos)
  elseif char == "[" then
    return decode_array(text, pos)
  elseif char == '"' then
    return decode_string(text, pos)
  elseif string.sub(text, pos, pos + 3) == "true" then
    return true, pos + 4
  elseif string.sub(text, pos, pos + 4) == "false" then
    return false, pos + 5
  elseif string.sub(text, pos, pos + 3) == "null" then
    return nil, pos + 4
  else
    local literal = string.match(text, "^-?%d+%.?%d*[eE]?[-+]?%d*", pos)
    if not literal then decode_error(text, pos, "unexpected value") end
    return tonumber(literal), pos + #literal
  end
end

function json.decode(text)
  local value = decode_value(text, 1)
  return value
end

-- ------------------------------------------------------------------ encode
local encode_value

local function encode_string(value)
  local out = { '"' }
  for index = 1, #value do
    local char = string.sub(value, index, index)
    if char == '"' then
      out[#out + 1] = '\\"'
    elseif char == "\\" then
      out[#out + 1] = "\\\\"
    elseif char == "\n" then
      out[#out + 1] = "\\n"
    elseif char == "\r" then
      out[#out + 1] = "\\r"
    elseif char == "\t" then
      out[#out + 1] = "\\t"
    else
      out[#out + 1] = char
    end
  end
  out[#out + 1] = '"'
  return table.concat(out)
end

local function is_array(value)
  local count = 0
  for _ in pairs(value) do
    count = count + 1
  end
  return count == #value
end

encode_value = function(value)
  local kind = type(value)
  if value == nil then
    return "null"
  elseif kind == "boolean" then
    return value and "true" or "false"
  elseif kind == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      error("cannot encode " .. tostring(value))
    end
    if value == math.floor(value) and math.abs(value) < 1e15 then
      return string.format("%d", value)
    end
    return string.format("%.14g", value)
  elseif kind == "string" then
    return encode_string(value)
  elseif kind == "table" then
    if is_array(value) then
      local parts = {}
      for index = 1, #value do
        parts[index] = encode_value(value[index])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local parts = {}
    for key, item in pairs(value) do
      parts[#parts + 1] = encode_string(tostring(key)) .. ":" .. encode_value(item)
    end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  error("cannot encode " .. kind)
end

function json.encode(value)
  return encode_value(value)
end

-- ------------------------------------------------------------------- shell
local function shell_quote(value)
  return "'" .. string.gsub(value, "'", [['\'']]) .. "'"
end

--- Run a command for real and return exit code, stdout, stderr.
local function run_command(command)
  local parts = {}
  for index = 1, #command do
    parts[index] = shell_quote(command[index])
  end
  local error_path = os.tmpname()
  local pipe = io.popen(table.concat(parts, " ") .. " 2>" .. error_path .. " ; printf '\\n__EXIT__%d' $?", "r")
  if not pipe then
    return 127, "", "could not spawn the command"
  end
  local stdout = pipe:read("*a")
  pipe:close()
  local code = tonumber(string.match(stdout, "__EXIT__(%d+)$")) or 0
  stdout = string.gsub(stdout, "\n__EXIT__%d+$", "")
  local handle = io.open(error_path, "r")
  local stderr = ""
  if handle then
    stderr = handle:read("*a")
    handle:close()
  end
  os.remove(error_path)
  return code, stdout, stderr
end

-- ------------------------------------------------------------------- state
local notifications = {}
local timers = {}
local namespace_ids = {}
local next_id = 100

--- Recorded API calls, keyed by the kind of call.
local record = {
  extmarks = {},
  buffers = {},
  floats = {},
  keymaps = {},
  commands = {},
  highlights = {},
  jobs = {},
  notifications = notifications,
}

local function new_id()
  next_id = next_id + 1
  return next_id
end

local buffer_options = {}
local window_options = {}

local function options_for(store, key, defaults)
  if not store[key] then
    store[key] = defaults()
  end
  return store[key]
end

-- --------------------------------------------------------------- fake job
--- `vim.fn.jobstart` double: captures callbacks and the argv.
local function start_job(argv, options)
  local job = { argv = argv, options = options, id = new_id(), stdin = {}, closed = false }
  record.jobs[#record.jobs + 1] = job
  return job
end

--- Push raw data through a job's on_stdout, the way libuv would.
local function feed(job, chunks, kind)
  kind = kind or "on_stdout"
  local handler = job.options[kind]
  if not handler then return end
  handler(job.id, chunks, kind)
end

local vim_api = {}

local function stub(name)
  return function(...)
    return nil
  end
end

vim_api.nvim_create_namespace = function(name)
  if not namespace_ids[name] then
    namespace_ids[name] = new_id()
  end
  return namespace_ids[name]
end

vim_api.nvim_create_buf = function()
  local buf = new_id()
  record.buffers[buf] = { lines = {}, extmarks = {} }
  return buf
end

vim_api.nvim_buf_is_valid = function(buf)
  return record.buffers[buf] ~= nil
end

vim_api.nvim_buf_is_loaded = vim_api.nvim_buf_is_valid

vim_api.nvim_buf_set_lines = function(buf, first, last, strict, lines)
  local target = record.buffers[buf]
  if not target then error("invalid buffer " .. tostring(buf)) end
  if first == 0 and last == -1 then
    target.lines = lines or {}
  else
    local replacement = lines or {}
    local stop = last == -1 and #target.lines or last
    local merged = {}
    for index = 1, first do
      merged[#merged + 1] = target.lines[index]
    end
    for index = 1, #replacement do
      merged[#merged + 1] = replacement[index]
    end
    for index = stop + 1, #target.lines do
      merged[#merged + 1] = target.lines[index]
    end
    target.lines = merged
  end
end

vim_api.nvim_buf_get_lines = function(buf, first, last)
  local target = record.buffers[buf]
  if not target then return {} end
  local stop = last == -1 and #target.lines or last
  local lines = {}
  for index = first + 1, stop do
    lines[#lines + 1] = target.lines[index] or ""
  end
  return lines
end

vim_api.nvim_buf_line_count = function(buf)
  local target = record.buffers[buf]
  return target and #target.lines or 0
end

vim_api.nvim_buf_set_name = function(buf, name)
  local target = record.buffers[buf]
  if target then target.name = name end
end

vim_api.nvim_buf_get_name = function(buf)
  local target = record.buffers[buf]
  return target and target.name or ""
end

vim_api.nvim_buf_clear_namespace = function(buf, ns, first, last)
  local target = record.buffers[buf]
  if not target then return end
  local kept = {}
  for _, mark in ipairs(target.extmarks) do
    local in_range = mark.row >= first and (last == -1 or mark.row < last)
    if not in_range or mark.ns ~= ns then
      kept[#kept + 1] = mark
    end
  end
  target.extmarks = kept
end

vim_api.nvim_buf_set_extmark = function(buf, ns, row, col, opts)
  local target = record.buffers[buf]
  if not target then error("invalid buffer " .. tostring(buf)) end
  local mark = {
    ns = ns,
    row = row,
    col = col,
    end_row = opts.end_row,
    end_col = opts.end_col,
    hl_group = opts.hl_group,
    line_hl_group = opts.line_hl_group,
    priority = opts.priority,
    id = opts.id or new_id(),
  }
  target.extmarks[#target.extmarks + 1] = mark
  record.extmarks[#record.extmarks + 1] = mark
  return mark.id
end

vim_api.nvim_open_win = function(buf, enter, opts)
  local win = new_id()
  record.floats[win] = { buf = buf, config = opts, valid = true, cursor = { 1, 0 } }
  return win
end

vim_api.nvim_win_is_valid = function(win)
  return record.floats[win] ~= nil and record.floats[win].valid
end

vim_api.nvim_win_close = function(win)
  if record.floats[win] then record.floats[win].valid = false end
end

vim_api.nvim_win_get_buf = function(win)
  local target = record.floats[win]
  return target and target.buf or 0
end

vim_api.nvim_win_set_config = function(win, opts)
  if record.floats[win] then record.floats[win].config = opts end
end

vim_api.nvim_win_get_width = function(win)
  local target = record.floats[win]
  return target and target.config.width or 80
end

vim_api.nvim_win_get_height = function(win)
  local target = record.floats[win]
  return target and target.config.height or 24
end

vim_api.nvim_win_set_cursor = function(win, pos)
  if record.floats[win] then record.floats[win].cursor = pos end
end

vim_api.nvim_win_get_cursor = function(win)
  local target = record.floats[win]
  return target and target.cursor or { 1, 0 }
end

vim_api.nvim_win_call = function(win, fn)
  fn()
end

vim_api.nvim_set_hl = function(ns, name, definition)
  record.highlights[name] = definition
end

vim_api.nvim_create_user_command = function(name, fn, opts)
  record.commands[name] = { fn = fn, opts = opts }
end

vim_api.nvim_create_autocmd = function(event, opts)
  local id = new_id()
  record.autocmds = record.autocmds or {}
  record.autocmds[id] = { event = event, opts = opts }
  return id
end

vim_api.nvim_del_autocmd = function() end
vim_api.nvim_create_augroup = function() return new_id() end
vim_api.nvim_get_current_buf = function() return 0 end
vim_api.nvim_get_current_win = function() return 0 end
vim_api.nvim_echo = function() end

-- Declared first: helpers below close over it.
local vim_global
vim_global = {
  api = vim_api,
  bo = setmetatable({}, {
    __index = function(_, buf)
      return options_for(buffer_options, buf, function()
        return { modifiable = true, buftype = "", bufhidden = "", swapfile = true, filetype = "", modified = false, buflisted = true }
      end)
    end,
  }),
  wo = setmetatable({}, {
    __index = function(_, win)
      return options_for(window_options, win, function()
        return { winhl = "", wrap = true, cursorline = false, number = false, signcolumn = "auto", spell = false, foldenable = true, scrolloff = 0, conceallevel = 0 }
      end)
    end,
  }),
  o = { columns = 140, lines = 40, timeoutlen = 1000 },
  g = {},
  json = json,
  log = { levels = { TRACE = 0, DEBUG = 1, INFO = 2, WARN = 3, ERROR = 4 } },
  schedule = function(fn)
    fn()
  end,
  schedule_wrap = function(fn)
    return fn
  end,
  defer_fn = function(fn)
    fn()
    return 0
  end,
  notify = function(message, level)
    notifications[#notifications + 1] = { message = message, level = level or 2 }
  end,
  inspect = function(value)
    return json.encode(value)
  end,
  deepcopy = function(value)
    if type(value) ~= "table" then return value end
    local copy = {}
    for key, item in pairs(value) do
      copy[key] = vim_global.deepcopy(item)
    end
    return copy
  end,
  split = function(value, pattern, opts)
    pattern = pattern or ","
    local parts = {}
    for part in string.gmatch(value, "([^" .. pattern .. "]+)") do
      parts[#parts + 1] = part
    end
    return parts
  end,
  tbl_deep_extend = function(behaviour, base, ...)
    local result = vim_global.deepcopy(base)
    for index = 1, select("#", ...) do
      local extra = select(index, ...)
      if type(extra) == "table" then
        for key, item in pairs(extra) do
          if type(item) == "table" and type(result[key]) == "table" and behaviour ~= "keep" then
            result[key] = vim_global.tbl_deep_extend(behaviour, result[key], item)
          elseif behaviour == "force" or result[key] == nil then
            result[key] = vim_global.deepcopy(item)
          end
        end
      end
    end
    return result
  end,
  tbl_get = function(table, ...)
    local current = table
    for index = 1, select("#", ...) do
      if type(current) ~= "table" then return nil end
      current = current[select(index, ...)]
    end
    return current
  end,
  list_extend = function(list, extra)
    for index = 1, #extra do
      list[#list + 1] = extra[index]
    end
    return list
  end,
  keymap = {
    set = function(mode, lhs, rhs, opts)
      record.keymaps[#record.keymaps + 1] = { mode = mode, lhs = lhs, rhs = rhs, opts = opts }
    end,
    del = function() end,
  },
  cmd = function(command)
    record.cmds = record.cmds or {}
    record.cmds[#record.cmds + 1] = command
  end,
  ui = {
    input = function(opts, on_confirm)
      on_confirm(record.input_value)
    end,
    select = function(list, opts, on_choice)
      local index = record.select_index or 1
      on_choice(list[index], index)
    end,
  },
  fn = {
    executable = function(name)
      return record.executables[name] ~= nil and 1 or 0
    end,
    expand = function(expr)
      return string.gsub(expr, "^~", os.getenv("HOME") or "/tmp")
    end,
    jobstart = function(argv, options)
      local job = start_job(argv, options)
      return job.id
    end,
    jobstop = function() end,
    --- -1 means "still running", which is what Neovim reports for a live job.
    jobwait = function()
      return { -1 }
    end,
    chansend = function(id, data)
      for _, job in ipairs(record.jobs) do
        if job.id == id then
          for index = 1, #data do
            job.stdin[#job.stdin + 1] = data[index]
          end
        end
      end
      return 1
    end,
    stdpath = function()
      return os.getenv("TMPDIR") or "/tmp"
    end,
    mkdir = function(path)
      os.execute("mkdir -p " .. shell_quote(path) .. " >/dev/null 2>&1")
    end,
    getpid = function()
      return 4242
    end,
    nr2char = function(code)
      if code < 0x80 then
        return string.char(code)
      elseif code < 0x800 then
        return string.char(0xc0 + math.floor(code / 64), 0x80 + code % 64)
      elseif code < 0x10000 then
        return string.char(0xe0 + math.floor(code / 4096), 0x80 + math.floor(code / 64) % 64, 0x80 + code % 64)
      end
      return string.char(
        0xf0 + math.floor(code / 262144),
        0x80 + math.floor(code / 4096) % 64,
        0x80 + math.floor(code / 64) % 64,
        0x80 + code % 64
      )
    end,
    fnamemodify = function(path, modifier)
      if modifier == ":t" then
        return string.match(path, "([^/]+)/?$") or ""
      end
      return path
    end,
  },
  uv = {
    hrtime = function()
      return math.floor(os.clock() * 1000000000)
    end,
    now = function()
      return math.floor(os.clock() * 1000)
    end,
    -- Methods take no `self`: the plugin is compiled with noImplicitSelf.
    new_timer = function()
      local timer = { started = false, closed = false, callback = nil, interval = 0, ticks = 0 }
      function timer.start(timeout, interval, callback)
        timer.started = true
        timer.interval = interval
        timer.callback = callback
        timers[#timers + 1] = timer
        if record.auto_tick then
          callback()
          timer.ticks = timer.ticks + 1
        end
      end
      function timer.stop()
        timer.started = false
      end
      function timer.close()
        timer.closed = true
        timer.started = false
      end
      function timer.is_closing()
        return timer.closed
      end
      return timer
    end,
    new_pipe = function()
      local pipe = { connected = false, closed = false, on_data = nil, path = nil }
      function pipe.connect(path, callback)
        if record.socket_fail then
          callback({ message = "ENOENT" })
          return
        end
        pipe.connected = true
        pipe.path = path
        record.pipes = record.pipes or {}
        record.pipes[#record.pipes + 1] = pipe
        callback(nil)
      end
      function pipe.read_start(callback)
        pipe.on_data = callback
      end
      function pipe.read_stop()
        pipe.on_data = nil
      end
      function pipe.write(data, callback)
        record.writes = record.writes or {}
        record.writes[#record.writes + 1] = data
        if callback then callback(nil) end
      end
      function pipe.close()
        pipe.connected = false
        pipe.closed = true
      end
      function pipe.is_closing()
        return pipe.closed == true
      end
      function pipe.shutdown(callback)
        if callback then callback() end
      end
      return pipe
    end,
    fs_unlink = function(path, callback)
      if callback then callback(nil) end
    end,
  },
  system = function(command, opts, callback)
    local code, stdout, stderr = run_command(command)
    record.system = record.system or {}
    record.system[#record.system + 1] = { command = command, code = code }
    local handle = {
      _code = code,
      wait = function()
        return { code = code, signal = 0, stdout = stdout, stderr = stderr }
      end,
      kill = function() end,
    }
    if callback then
      callback({ code = code, signal = 0, stdout = stdout, stderr = stderr })
    end
    return handle
  end,
}

_G.vim = vim_global

--- Test-only helpers, namespaced so they cannot collide with the plugin.
_G.__player_test = {
  record = record,
  json = json,
  feed = feed,
  jobs = record.jobs,
  timers = timers,
  reset = function()
    record.extmarks = {}
    record.buffers = {}
    record.floats = {}
    -- keymaps and user commands are global, one-shot state: keep them.
    record.highlights = {}
    record.jobs = {}
    record.writes = {}
    record.pipes = {}
    record.system = {}
    record.cmds = {}
    record.select_index = 1
    record.input_value = nil
    for index = #notifications, 1, -1 do
      notifications[index] = nil
    end
    for index = #timers, 1, -1 do
      timers[index] = nil
    end
  end,
  set_executables = function(...)
    record.executables = {}
    for index = 1, select("#", ...) do
      record.executables[select(index, ...)] = true
    end
  end,
  last_notification = function()
    return notifications[#notifications]
  end,
  notifications = notifications,
  find_job = function(name)
    for _, job in ipairs(record.jobs) do
      if job.argv[1] == name then return job end
    end
  end,
  marks_for = function(buf, group)
    local target = record.buffers[buf]
    if not target then return {} end
    local found = {}
    for _, mark in ipairs(target.extmarks) do
      if group == nil or mark.hl_group == group then
        found[#found + 1] = mark
      end
    end
    return found
  end,
  read_file = function(path)
    local handle = io.open(path, "r")
    if not handle then error("cannot read " .. path) end
    local text = handle:read("*a")
    handle:close()
    return text
  end,
  tick = function(count)
    for index = 1, (count or 1) do
      for _, timer in ipairs(timers) do
        if timer.started and timer.callback then
          timer.callback()
          timer.ticks = timer.ticks + 1
        end
      end
    end
  end,
}

return vim_global
