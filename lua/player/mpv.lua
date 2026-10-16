local M = {}
local uv = vim.uv or vim.loop
local config = require("player.config")
local state = { job = nil, pipe = nil, socket = nil, next_id = 0, pending = {}, waiting = {}, buffer = "", connected = false, visualizer = false }

local function notify(message, level)
  vim.schedule(function() vim.notify(message, level or vim.log.levels.INFO, { title = "player.nvim" }) end)
end

local function close_pipe()
  if state.pipe then
    pcall(function() state.pipe:read_stop() end)
    if not state.pipe:is_closing() then state.pipe:close() end
    state.pipe = nil
  end
  state.connected = false
end

local function write_raw(message)
  if state.connected and state.pipe and not state.pipe:is_closing() then
    state.pipe:write(vim.json.encode(message) .. "\n")
    return true
  end
  return false
end

local function on_line(line)
  local ok, message = pcall(vim.json.decode, line)
  if not ok or type(message) ~= "table" then return end
  if message.request_id and state.pending[message.request_id] then
    local callback = state.pending[message.request_id]
    state.pending[message.request_id] = nil
    if callback then vim.schedule(function() callback(message.error == "success" and message.data or nil, message) end) end
  end
  if message.event == "end-file" then
    vim.schedule(function() require("player")._on_end_file(message) end)
  end
end

local function connect(attempt)
  attempt = attempt or 1
  if not state.socket or state.connected then return end
  local pipe = uv.new_pipe(false)
  state.pipe = pipe
  pipe:connect(state.socket, function(err)
    if err then
      close_pipe()
      if attempt < 30 then vim.defer_fn(function() connect(attempt + 1) end, 100) end
      return
    end
    state.connected = true
    state.buffer = ""
    pipe:read_start(function(read_err, data)
      if read_err or not data then
        close_pipe()
        return
      end
      state.buffer = state.buffer .. data
      while true do
        local newline = state.buffer:find("\n", 1, true)
        if not newline then break end
        local line = state.buffer:sub(1, newline - 1)
        state.buffer = state.buffer:sub(newline + 1)
        on_line(line)
      end
    end)
    local waiting = state.waiting
    state.waiting = {}
    for _, item in ipairs(waiting) do M.command(item.command, item.callback) end
  end)
end

local function alive()
  return state.job and vim.fn.jobwait({ state.job }, 0)[1] == -1
end

function M.ensure()
  if alive() then return true end
  local opts = config.options
  if vim.fn.executable(opts.mpv) ~= 1 then
    notify("mpv is required. Install mpv and try again.", vim.log.levels.ERROR)
    return false
  end
  local cache = vim.fn.stdpath("cache") .. "/player.nvim"
  vim.fn.mkdir(cache, "p")
  state.socket = cache .. "/mpv-" .. tostring(vim.fn.getpid()) .. ".sock"
  pcall(uv.fs_unlink, state.socket)
  local args = { opts.mpv, "--idle=yes", "--no-terminal", "--force-window=no", "--input-ipc-server=" .. state.socket, "--volume=" .. tostring(opts.default_volume) }
  vim.list_extend(args, opts.mpv_args or {})
  state.job = vim.fn.jobstart(args, {
    on_exit = function()
      close_pipe()
      state.job = nil
      if state.socket then pcall(uv.fs_unlink, state.socket) end
      state.socket = nil
    end,
  })
  if state.job <= 0 then
    state.job = nil
    notify("Could not start mpv.", vim.log.levels.ERROR)
    return false
  end
  vim.defer_fn(function() connect(1) end, 100)
  return true
end

function M.command(command, callback)
  if not alive() and not M.ensure() then return end
  if not state.connected then
    state.waiting[#state.waiting + 1] = { command = command, callback = callback }
    return
  end
  state.next_id = state.next_id + 1
  local id = state.next_id
  if callback then state.pending[id] = callback end
  write_raw({ command = command, request_id = id })
end

function M.play(source)
  if not M.ensure() then return end
  M.command({ "loadfile", source, "replace" })
  M.apply_audio()
end

function M.pause()
  M.command({ "cycle", "pause" })
end

function M.stop()
  M.command({ "stop" })
end

function M.seek(seconds)
  M.command({ "seek", seconds, "absolute" })
end

function M.property(name, callback)
  M.command({ "get_property", name }, callback)
end

function M.apply_audio()
  local opts = config.options
  local filters = {}
  if opts.eq.enabled then
    local stages = {}
    for i = 1, 10 do
      local gain = tonumber(opts.eq.bands[i]) or 0
      gain = math.max(-12, math.min(12, gain))
      local frequency = tonumber(opts.eq.frequencies[i]) or (125 * 2 ^ (i - 3))
      stages[#stages + 1] = string.format("equalizer=f=%d:t=q:w=1:g=%.1f", frequency, gain)
    end
    filters[#filters + 1] = { name = "lavfi", params = { graph = table.concat(stages, ",") } }
  end
  if opts.filter.enabled and opts.filter.type ~= "off" then
    local kind = opts.filter.type
    local hz = math.max(20, math.min(20000, tonumber(opts.filter.frequency) or 1000))
    local width = math.max(0.1, math.min(10, tonumber(opts.filter.width) or 1))
    local graph
    if kind == "lowpass" or kind == "highpass" then
      graph = string.format("%s=f=%d", kind, hz)
    elseif kind == "bandpass" then
      graph = string.format("bandpass=f=%d:width_type=q:width=%.2f", hz, width)
    end
    if graph then filters[#filters + 1] = { name = "lavfi", params = { graph = graph } } end
  end
  M.command({ "set_property", "af", filters })
end

function M.visualize(enabled)
  enabled = enabled == nil and not state.visualizer or enabled
  if not alive() then
    notify("Start a track before opening the spectrum visualizer.", vim.log.levels.WARN)
    return
  end
  local graph = "[aid1]asplit=2[ao][viz];[viz]showcqt=s=960x360:r=24[vo]"
  M.command({ "set_property", "options/lavfi-complex", enabled and graph or "" }, function(_, response)
    if not response or response.error ~= "success" then
      notify("mpv could not create the spectrum. Check that its FFmpeg build includes showcqt.", vim.log.levels.ERROR)
      return
    end
    state.visualizer = enabled
    M.command({ "set_property", "options/force-window", enabled })
    notify(enabled and "Audio spectrum window opened." or "Audio spectrum window closed.")
  end)
end

function M.shutdown()
  if alive() then vim.fn.jobstop(state.job) end
  close_pipe()
  if state.socket then pcall(uv.fs_unlink, state.socket) end
  state.job, state.socket, state.waiting = nil, nil, {}
  state.visualizer = false
end

function M.is_alive() return alive() end

return M
