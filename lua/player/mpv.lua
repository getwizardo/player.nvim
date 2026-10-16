--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local emit, notify, closePipe, writeRaw, handleResponse, handlePropertyChange, handleLine, connect, MAX_CONNECT_TRIES, state, handlers
local ____config = require("player.config")
local options = ____config.options
local ____lua_2Dutil = require("player.lua-util")
local attempt = ____lua_2Dutil.attempt
local trim = ____lua_2Dutil.trim
function emit(event, payload)
    local list = handlers[event]
    if not list then
        return
    end
    do
        local index = 0
        while index < #list do
            list[index + 1](payload)
            index = index + 1
        end
    end
end
function notify(message, level)
    local target = level == nil and vim.log.levels.INFO or level
    vim.schedule(function()
        vim.notify(message, target, {title = "player.nvim"})
    end)
end
function closePipe()
    local pipe = state.pipe
    if pipe ~= nil then
        attempt(function()
            pipe.read_stop()
        end)
        if not pipe.is_closing() then
            pipe.close()
        end
    end
    state.pipe = nil
    state.connected = false
    state.connecting = false
    state.buffer = ""
end
function writeRaw(message)
    if state.connected and state.pipe ~= nil and not state.pipe.is_closing() then
        state.pipe.write(vim.json.encode(message) .. "\n")
        return true
    end
    return false
end
function handleResponse(message)
    local id = message.request_id
    if id == nil or id == nil then
        return
    end
    local key = tostring(id)
    local request = state.pending[key]
    if request == nil then
        return
    end
    state.pending[key] = nil
    local response = {
        error = type(message.error) == "string" and message.error or "success",
        data = message.data
    }
    if request.callback ~= nil then
        vim.schedule(function()
            local callback = request.callback
            if callback ~= nil then
                callback(response.data, response)
            end
        end)
    end
end
function handlePropertyChange(message)
    local id = message.id
    if id == nil or id == nil then
        return
    end
    local observer = state.observed[tostring(id)]
    if observer == nil then
        return
    end
    local value = message.data
    vim.schedule(function()
        observer.callback(value)
    end)
end
function handleLine(line)
    local decoded = attempt(function()
        return vim.json.decode(line)
    end)
    if not decoded.ok or type(decoded.value) ~= "table" then
        return
    end
    local message = decoded.value
    if message.request_id ~= nil and message.request_id ~= nil then
        handleResponse(message)
        return
    end
    local event = message.event
    if event == nil then
        return
    end
    if event == "property-change" then
        handlePropertyChange(message)
        return
    end
    vim.schedule(function()
        emit(event, message)
    end)
end
function connect(tries)
    if state.socket == "" or state.connected or state.connecting then
        return
    end
    state.connecting = true
    local pipe = vim.uv.new_pipe()
    state.pipe = pipe
    pipe.connect(
        state.socket,
        function(err)
            if err ~= nil and err ~= nil then
                closePipe()
                if tries < MAX_CONNECT_TRIES and not state.stopping then
                    local delay = tries * 100 > 1000 and 1000 or tries * 100
                    vim.defer_fn(
                        function()
                            connect(tries + 1)
                        end,
                        delay
                    )
                    return
                end
                state.failed = true
                notify("Could not reach the mpv IPC socket. The player will start mpv without remote control.", vim.log.levels.ERROR)
                return
            end
            state.connected = true
            state.connecting = false
            state.failed = false
            state.buffer = ""
            pipe.read_start(function(readErr, data)
                if readErr ~= nil and readErr ~= nil then
                    closePipe()
                    return
                end
                state.buffer = state.buffer .. tostring(data)
                while true do
                    local newline = string.find(state.buffer, "\n", 1, true)
                    if newline == nil then
                        break
                    end
                    local line = string.sub(state.buffer, 1, newline - 1)
                    state.buffer = string.sub(state.buffer, newline + 1)
                    handleLine(line)
                end
            end)
            local waiting = state.waiting
            state.waiting = {}
            do
                local index = 0
                while index < #waiting do
                    ____exports.command(waiting[index + 1].command, waiting[index + 1].callback)
                    index = index + 1
                end
            end
        end
    )
end
--- True while the mpv process is running.
function ____exports.isAlive()
    if state.job == 0 then
        return false
    end
    local result = vim.fn.jobwait({state.job}, 0)
    return #result > 0 and result[1] == -1
end
--- Start mpv when it is not running yet. Returns false when that failed.
function ____exports.ensure()
    if ____exports.isAlive() then
        return true
    end
    local settings = options()
    if vim.fn.executable(settings.mpv) ~= 1 then
        notify("mpv is required. Install mpv and try again.", vim.log.levels.ERROR)
        return false
    end
    local directory = vim.fn.stdpath("cache") .. "/player.nvim"
    if vim.fn.mkdir(directory, "p") ~= 1 and vim.fn.isdirectory(directory) ~= 1 then
        notify(("Could not create the cache directory " .. directory) .. ".", vim.log.levels.ERROR)
        return false
    end
    state.socket = ((directory .. "/mpv-") .. tostring(vim.fn.getpid())) .. ".sock"
    attempt(function()
        vim.uv.fs_unlink(state.socket)
    end)
    local args = {
        settings.mpv,
        "--idle=yes",
        "--no-terminal",
        "--force-window=no",
        "--input-ipc-server=" .. state.socket,
        "--volume=" .. tostring(settings.default_volume)
    }
    do
        local index = 0
        while index < #settings.mpv_args do
            args[#args + 1] = settings.mpv_args[index + 1]
            index = index + 1
        end
    end
    state.stopping = false
    state.failed = false
    state.job = vim.fn.jobstart(
        args,
        {on_exit = function()
            closePipe()
            state.job = 0
            if state.socket ~= "" then
                attempt(function()
                    vim.uv.fs_unlink(state.socket)
                end)
            end
            state.socket = ""
            state.waiting = {}
            state.observed = {}
            if not state.stopping then
                notify("mpv exited.")
            end
        end}
    )
    if state.job <= 0 then
        state.job = 0
        notify("Could not start mpv.", vim.log.levels.ERROR)
        return false
    end
    vim.defer_fn(
        function()
            connect(1)
        end,
        50
    )
    return true
end
--- Send a command to mpv.
-- 
-- The callback receives the decoded `data` field and the full response. When
-- mpv is not connected yet the command is queued and replayed as soon as the
-- IPC socket is up.
function ____exports.command(args, callback)
    if not ____exports.isAlive() and not ____exports.ensure() then
        return
    end
    if not state.connected then
        local waiting = {command = args}
        if callback ~= nil then
            waiting.callback = callback
        end
        state.waiting[#state.waiting + 1] = waiting
        return
    end
    state.nextId = state.nextId + 1
    local id = state.nextId
    if callback ~= nil then
        local request = {callback = callback}
        state.pending[tostring(id)] = request
        vim.defer_fn(
            function()
                local pending = state.pending[tostring(id)]
                if pending ~= nil then
                    state.pending[tostring(id)] = nil
                    notify("mpv did not answer the request in time.", vim.log.levels.WARN)
                end
            end,
            15000
        )
    end
    writeRaw({command = args, request_id = id})
end
MAX_CONNECT_TRIES = 8
state = {
    job = 0,
    pipe = nil,
    socket = "",
    nextId = 0,
    nextObserverId = 0,
    pending = {},
    waiting = {},
    observed = {},
    buffer = "",
    connected = false,
    connecting = false,
    failed = false,
    visualizer = false,
    stopping = false
}
handlers = {}
--- Build the argument list of an mpv command.
function ____exports.cmd(...)
    local args = {...}
    return args
end
--- Rebuild the audio filter chain.
-- 
-- The equalizer and the filter are combined into a single `lavfi` graph so
-- that mpv only has to instantiate a single filter chain.
function ____exports.applyAudio()
    local settings = options()
    local stages = {}
    if settings.eq.enabled then
        do
            local index = 0
            while index < #settings.eq.bands do
                local gain = settings.eq.bands[index + 1]
                if gain < -12 then
                    gain = -12
                end
                if gain > 12 then
                    gain = 12
                end
                local frequency = settings.eq.frequencies[index + 1]
                stages[#stages + 1] = string.format("equalizer=f=%d:t=q:w=1:g=%.1f", frequency, gain)
                index = index + 1
            end
        end
    end
    if settings.filter.enabled and settings.filter.type ~= "off" then
        local kind = settings.filter.type
        local hz = settings.filter.frequency
        local width = settings.filter.width
        if kind == "lowpass" or kind == "highpass" then
            stages[#stages + 1] = string.format("%s=f=%d", kind, hz)
        elseif kind == "bandpass" then
            stages[#stages + 1] = string.format("bandpass=f=%d:width_type=q:width=%.2f", hz, width)
        end
    end
    local filters = {}
    if #stages > 0 then
        filters[1] = {
            name = "lavfi",
            params = {graph = table.concat(stages, ",")}
        }
    end
    ____exports.command(____exports.cmd("set_property", "af", filters))
end
--- Subscribe to an mpv event (`end-file`, `file-loaded`, ...).
function ____exports.on(event, handler)
    if handlers[event] == nil then
        handlers[event] = {}
    end
    handlers[event][#handlers[event] + 1] = handler
end
--- Read a property from mpv.
function ____exports.property(name, callback)
    ____exports.command(
        ____exports.cmd("get_property", name),
        function(data)
            callback(data)
        end
    )
end
--- Watch a property; the callback fires on every change.
function ____exports.observe(name, callback)
    if not ____exports.ensure() then
        return 0
    end
    state.nextObserverId = state.nextObserverId + 1
    local id = state.nextObserverId
    local observer = {id = id, name = name, callback = callback}
    state.observed[tostring(id)] = observer
    ____exports.command(____exports.cmd("observe_property", id, name))
    return id
end
--- Stop watching a property.
function ____exports.unobserve(id)
    local key = tostring(id)
    if state.observed[key] == nil then
        return
    end
    state.observed[key] = nil
    ____exports.command(____exports.cmd("unobserve_property", id))
end
--- Play a file with a plain mpv process.
-- 
-- This is the fallback for the rare setups where the IPC socket cannot be
-- reached: the music plays, but the plugin cannot control mpv.
function ____exports.playDirect(source)
    local settings = options()
    local args = {settings.mpv, "--no-video", "--no-terminal"}
    do
        local index = 0
        while index < #settings.mpv_args do
            args[#args + 1] = settings.mpv_args[index + 1]
            index = index + 1
        end
    end
    args[#args + 1] = source
    local job = vim.fn.jobstart(
        args,
        {on_exit = function()
            notify("The fallback mpv process exited.")
        end}
    )
    if job <= 0 then
        notify("Could not start mpv.", vim.log.levels.ERROR)
        return
    end
    notify("mpv was started without remote control: the IPC socket is not reachable.")
end
--- Load a file or URL and start playing it.
function ____exports.play(source)
    if not ____exports.ensure() then
        return
    end
    if state.failed then
        ____exports.playDirect(source)
        return
    end
    ____exports.command(
        ____exports.cmd("loadfile", source, "replace"),
        function(_data, response)
            if response == nil or response.error ~= "success" then
                local reason = response == nil and "unknown error" or response.error
                notify((("mpv could not play " .. source) .. ": ") .. reason, vim.log.levels.ERROR)
            end
        end
    )
    ____exports.applyAudio()
end
--- Toggle the pause state.
function ____exports.pause()
    ____exports.command(____exports.cmd("cycle", "pause"))
end
--- Stop playback.
function ____exports.stop()
    ____exports.command(____exports.cmd("stop"))
end
--- Seek to an absolute position in seconds.
function ____exports.seek(seconds)
    ____exports.command(____exports.cmd("seek", seconds, "absolute"))
end
--- Set the volume (0-100).
function ____exports.setVolume(volume)
    ____exports.command(____exports.cmd("set_property", "volume", volume))
end
--- Read the current volume.
function ____exports.getVolume(callback)
    ____exports.property(
        "volume",
        function(value)
            callback(type(value) == "number" and value or 0)
        end
    )
end
--- Toggle (or set) the live spectrum window.
function ____exports.visualize(enabled)
    local ____temp_0
    if enabled == nil then
        ____temp_0 = not state.visualizer
    else
        ____temp_0 = enabled
    end
    local wanted = ____temp_0
    if not ____exports.isAlive() then
        notify("Start a track before opening the spectrum visualizer.", vim.log.levels.WARN)
        return
    end
    local graph = "[aid1]asplit=2[ao][viz];[viz]showcqt=s=960x360:r=24[vo]"
    ____exports.command(
        ____exports.cmd("set_property", "options/lavfi-complex", wanted and graph or ""),
        function(_data, response)
            if response == nil or response.error ~= "success" then
                notify("mpv could not create the spectrum. Check that its FFmpeg build includes showcqt.", vim.log.levels.ERROR)
                return
            end
            state.visualizer = wanted
            ____exports.command(____exports.cmd("set_property", "options/force-window", wanted))
            notify(wanted and "Audio spectrum window opened." or "Audio spectrum window closed.")
        end
    )
end
--- True while the spectrum window is open.
function ____exports.isVisualizing()
    return state.visualizer
end
--- Stop mpv and release every resource.
function ____exports.shutdown()
    state.stopping = true
    if state.job ~= 0 then
        attempt(function()
            vim.fn.jobstop(state.job)
        end)
    end
    closePipe()
    if state.socket ~= "" then
        attempt(function()
            vim.uv.fs_unlink(state.socket)
        end)
    end
    state.job = 0
    state.socket = ""
    state.waiting = {}
    state.pending = {}
    state.observed = {}
    state.visualizer = false
    state.failed = false
end
--- Describe the mpv process for `:checkhealth`.
function ____exports.describe()
    if not ____exports.isAlive() then
        return "not running"
    end
    return ("running (socket " .. trim(state.socket)) .. ")"
end
return ____exports
