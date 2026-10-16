-- Lua Library inline imports
local function __TS__ArraySlice(self, first, last)
    local len = #self
    first = first or 0
    if first < 0 then
        first = len + first
        if first < 0 then
            first = 0
        end
    else
        if first > len then
            first = len
        end
    end
    last = last or len
    if last < 0 then
        last = len + last
        if last < 0 then
            last = 0
        end
    else
        if last > len then
            last = len
        end
    end
    local out = {}
    first = first + 1
    last = last + 1
    local n = 1
    while first < last do
        out[n] = self[first]
        first = first + 1
        n = n + 1
    end
    return out
end

local function __TS__StringIncludes(self, searchString, position)
    if not position then
        position = 1
    else
        position = position + 1
    end
    local index = string.find(self, searchString, position, true)
    return index ~= nil
end

local function __TS__New(target, ...)
    local instance = setmetatable({}, target.prototype)
    instance:____constructor(...)
    return instance
end

local function __TS__Class(self)
    local c = {prototype = {}}
    c.prototype.__index = c.prototype
    c.prototype.constructor = c
    return c
end

local function __TS__ClassExtends(target, base)
    target.____super = base
    local staticMetatable = setmetatable({__index = base}, base)
    setmetatable(target, staticMetatable)
    local baseMetatable = getmetatable(base)
    if baseMetatable then
        if type(baseMetatable.__index) == "function" then
            staticMetatable.__index = baseMetatable.__index
        end
        if type(baseMetatable.__newindex) == "function" then
            staticMetatable.__newindex = baseMetatable.__newindex
        end
    end
    setmetatable(target.prototype, base.prototype)
    if type(base.prototype.__index) == "function" then
        target.prototype.__index = base.prototype.__index
    end
    if type(base.prototype.__newindex) == "function" then
        target.prototype.__newindex = base.prototype.__newindex
    end
    if type(base.prototype.__tostring) == "function" then
        target.prototype.__tostring = base.prototype.__tostring
    end
end

local Error, RangeError, ReferenceError, SyntaxError, TypeError, URIError
do
    local function getErrorStack(self, constructor)
        if debug == nil then
            return nil
        end
        local level = 1
        while true do
            local info = debug.getinfo(level, "f")
            level = level + 1
            if not info then
                level = 1
                break
            elseif info.func == constructor then
                break
            end
        end
        if __TS__StringIncludes(_VERSION, "Lua 5.0") then
            return debug.traceback(("[Level " .. tostring(level)) .. "]")
        elseif _VERSION == "Lua 5.1" then
            return string.sub(
                debug.traceback("", level),
                2
            )
        else
            return debug.traceback(nil, level)
        end
    end
    local function wrapErrorToString(self, getDescription)
        return function(self)
            local description = getDescription(self)
            local caller = debug.getinfo(3, "f")
            local isClassicLua = __TS__StringIncludes(_VERSION, "Lua 5.0")
            if isClassicLua or caller and caller.func ~= error then
                return description
            else
                return (description .. "\n") .. tostring(self.stack)
            end
        end
    end
    local function initErrorClass(self, Type, name)
        Type.name = name
        return setmetatable(
            Type,
            {__call = function(____, _self, message) return __TS__New(Type, message) end}
        )
    end
    local ____initErrorClass_1 = initErrorClass
    local ____class_0 = __TS__Class()
    ____class_0.name = ""
    function ____class_0.prototype.____constructor(self, message)
        if message == nil then
            message = ""
        end
        self.message = message
        self.name = "Error"
        self.stack = getErrorStack(nil, __TS__New)
        local metatable = getmetatable(self)
        if metatable and not metatable.__errorToStringPatched then
            metatable.__errorToStringPatched = true
            metatable.__tostring = wrapErrorToString(nil, metatable.__tostring)
        end
    end
    function ____class_0.prototype.__tostring(self)
        return self.message ~= "" and (self.name .. ": ") .. self.message or self.name
    end
    Error = ____initErrorClass_1(nil, ____class_0, "Error")
    local function createErrorClass(self, name)
        local ____initErrorClass_3 = initErrorClass
        local ____class_2 = __TS__Class()
        ____class_2.name = ____class_2.name
        __TS__ClassExtends(____class_2, Error)
        function ____class_2.prototype.____constructor(self, ...)
            ____class_2.____super.prototype.____constructor(self, ...)
            self.name = name
        end
        return ____initErrorClass_3(nil, ____class_2, name)
    end
    RangeError = createErrorClass(nil, "RangeError")
    ReferenceError = createErrorClass(nil, "ReferenceError")
    SyntaxError = createErrorClass(nil, "SyntaxError")
    TypeError = createErrorClass(nil, "TypeError")
    URIError = createErrorClass(nil, "URIError")
end

local function __TS__ObjectGetOwnPropertyDescriptors(object)
    local metatable = getmetatable(object)
    if not metatable then
        return {}
    end
    return rawget(metatable, "_descriptors") or ({})
end

local function __TS__Delete(target, key)
    local descriptors = __TS__ObjectGetOwnPropertyDescriptors(target)
    local descriptor = descriptors[key]
    if descriptor then
        if not descriptor.configurable then
            error(
                __TS__New(
                    TypeError,
                    ((("Cannot delete property " .. tostring(key)) .. " of ") .. tostring(target)) .. "."
                ),
                0
            )
        end
        descriptors[key] = nil
        return true
    end
    target[key] = nil
    return true
end

local function __TS__CountVarargs(...)
    return select("#", ...)
end

local function __TS__ArraySplice(self, ...)
    local args = {...}
    local len = #self
    local actualArgumentCount = __TS__CountVarargs(...)
    local start = args[1]
    local deleteCount = args[2]
    if start < 0 then
        start = len + start
        if start < 0 then
            start = 0
        end
    elseif start > len then
        start = len
    end
    local itemCount = actualArgumentCount - 2
    if itemCount < 0 then
        itemCount = 0
    end
    local actualDeleteCount
    if actualArgumentCount == 0 then
        actualDeleteCount = 0
    elseif actualArgumentCount == 1 then
        actualDeleteCount = len - start
    else
        actualDeleteCount = deleteCount or 0
        if actualDeleteCount < 0 then
            actualDeleteCount = 0
        end
        if actualDeleteCount > len - start then
            actualDeleteCount = len - start
        end
    end
    local out = {}
    for k = 1, actualDeleteCount do
        local from = start + k
        if self[from] ~= nil then
            out[k] = self[from]
        end
    end
    if itemCount < actualDeleteCount then
        for k = start + 1, len - actualDeleteCount do
            local from = k + actualDeleteCount
            local to = k + itemCount
            if self[from] then
                self[to] = self[from]
            else
                self[to] = nil
            end
        end
        for k = len - actualDeleteCount + itemCount + 1, len do
            self[k] = nil
        end
    elseif itemCount > actualDeleteCount then
        for k = len - actualDeleteCount, start + 1, -1 do
            local from = k + actualDeleteCount
            local to = k + itemCount
            if self[from] then
                self[to] = self[from]
            else
                self[to] = nil
            end
        end
    end
    local j = start + 1
    for i = 3, actualArgumentCount do
        self[j] = args[i]
        j = j + 1
    end
    for k = #self, len - actualDeleteCount + itemCount + 1, -1 do
        self[k] = nil
    end
    return out
end
-- End of Lua Library inline imports
local ____exports = {}
local schedule, closePipe, writeLine, drainPending, dispatchLine, onConnected, connect, pushOutput, state, QUEUE_LIMIT, MAX_ATTEMPTS, ATTEMPT_MS
local ____config = require("player.config")
local getOptions = ____config.get
local ____util = require("player.util")
local fail = ____util.fail
local indexOf = ____util.indexOf
local notify = ____util.notify
local notifyOnce = ____util.notifyOnce
local sub = ____util.sub
local trim = ____util.trim
local warn = ____util.warn
function schedule(callback, delayMs)
    local timer = vim.uv.new_timer()
    timer.start(
        delayMs,
        0,
        function()
            timer.stop()
            if not timer.is_closing() then
                timer.close()
            end
            vim.schedule(callback)
        end
    )
end
function ____exports.isAlive()
    if state.job == nil then
        return false
    end
    local status = unpack(
        vim.fn.jobwait({state.job}, 0),
        1,
        1
    )
    return status == -1
end
--- The last lines mpv wrote to stderr, used to explain failures.
function ____exports.diagnostics()
    if #state.stderr == 0 then
        return ""
    end
    return table.concat(
        __TS__ArraySlice(state.stderr, -6),
        "\n"
    )
end
function closePipe()
    state.connected = false
    if state.pipe ~= nil then
        local pipe = state.pipe
        state.pipe = nil
        pcall(function() return pipe.read_stop() end)
        if not pipe.is_closing() then
            pcall(function() return pipe.close() end)
        end
    end
end
function writeLine(message)
    if not state.connected or state.pipe == nil then
        return false
    end
    local result = {pcall(function()
        local ____opt_0 = state.pipe
        return ____opt_0 and ____opt_0.write(vim.json.encode(message) .. "\n")
    end)}
    return result[1]
end
function drainPending(reason)
    local callbacks = {}
    for id in pairs(state.pending) do
        local callback = state.pending[tonumber(id) or 0]
        if callback ~= nil then
            callbacks[#callbacks + 1] = callback
        end
    end
    state.pending = {}
    for ____, callback in ipairs(callbacks) do
        vim.schedule(function() return callback(nil, {error = reason}) end)
    end
end
function dispatchLine(line)
    if trim(line) == "" then
        return
    end
    local result = {pcall(function() return vim.json.decode(line) end)}
    local ok = result[1]
    local decoded = result[2]
    if not ok or type(decoded) ~= "table" then
        return
    end
    local message = decoded
    local id = message.request_id
    if id ~= nil then
        local callback = state.pending[id]
        if callback ~= nil then
            __TS__Delete(state.pending, id)
            vim.schedule(function() return callback(message.data, message) end)
        end
    end
    if message.event == "property-change" and message.name ~= nil then
        local observer = state.observers[message.name]
        if observer ~= nil then
            vim.schedule(function() return observer(message.data) end)
        end
    end
    if message.event ~= nil then
        for ____, handler in ipairs(state.handlers) do
            local current = handler
            vim.schedule(function() return current(message) end)
        end
    end
end
function onConnected()
    state.connected = true
    state.connecting = false
    state.buffer = ""
    local pipe = state.pipe
    if pipe == nil then
        return
    end
    pipe.read_start(function(____error, data)
        if ____error ~= nil or data == nil then
            closePipe()
            drainPending("connection lost")
            if ____exports.isAlive() then
                schedule(
                    function() return connect(1) end,
                    ATTEMPT_MS
                )
            end
            return
        end
        state.buffer = state.buffer .. data
        while true do
            local boundary = indexOf(state.buffer, "\n")
            if boundary == nil then
                break
            end
            local line = sub(state.buffer, 1, boundary - 1)
            state.buffer = sub(state.buffer, boundary + 1)
            dispatchLine(line)
        end
    end)
    for name in pairs(state.observers) do
        ____exports.send({"observe_property", state.observeId, name})
    end
    local queued = state.queued
    state.queued = {}
    for ____, item in ipairs(queued) do
        if item.callback ~= nil then
            state.pending[item.id] = item.callback
        end
        writeLine({command = item.command, request_id = item.id})
    end
end
function connect(attempt)
    if state.connected or state.connecting then
        return
    end
    if state.socket == nil or not ____exports.isAlive() then
        state.connecting = false
        return
    end
    state.connecting = true
    local pipe = vim.uv.new_pipe(false)
    state.pipe = pipe
    pipe.connect(
        state.socket,
        function(____error)
            if ____error ~= nil then
                closePipe()
                state.connecting = false
                if attempt >= MAX_ATTEMPTS then
                    local detail = ____exports.diagnostics()
                    fail("Could not reach mpv's control socket." .. (detail == "" and "" or "\n" .. detail))
                    return
                end
                schedule(
                    function() return connect(attempt + 1) end,
                    ATTEMPT_MS
                )
                return
            end
            onConnected()
        end
    )
end
function pushOutput(chunk)
    if trim(chunk) == "" then
        return
    end
    local ____state_stderr_2 = state.stderr
    ____state_stderr_2[#____state_stderr_2 + 1] = chunk
    while #state.stderr > 40 do
        __TS__ArraySplice(state.stderr, 0, 1)
    end
end
function ____exports.ensure()
    if ____exports.isAlive() then
        return true
    end
    local options = getOptions()
    if vim.fn.executable(options.mpv) ~= 1 then
        fail(options.mpv .. " is not installed or not on PATH. Install mpv to play audio.")
        return false
    end
    closePipe()
    state.stderr = {}
    local cache = vim.fn.stdpath("cache") .. "/player.nvim"
    vim.fn.mkdir(cache, "p")
    local socket = ((((cache .. "/mpv-") .. tostring(vim.fn.getpid())) .. "-") .. tostring(vim.uv.hrtime() % 1000000)) .. ".sock"
    pcall(function() return vim.uv.fs_unlink(socket) end)
    state.socket = socket
    local args = {
        options.mpv,
        "--idle=yes",
        "--no-terminal",
        "--force-window=no",
        "--input-ipc-server=" .. socket,
        "--volume=" .. tostring(options.default_volume)
    }
    for ____, extra in ipairs(options.mpv_args) do
        args[#args + 1] = extra
    end
    local job = vim.fn.jobstart(
        args,
        {
            on_stderr = function(_job, data)
                for ____, chunk in ipairs(data) do
                    pushOutput(chunk)
                end
            end,
            on_stdout = function(_job, data)
                for ____, chunk in ipairs(data) do
                    pushOutput(chunk)
                end
            end,
            on_exit = function()
                closePipe()
                state.job = nil
                state.queued = {}
                drainPending("mpv exited")
                if state.socket ~= nil then
                    pcall(function() return vim.uv.fs_unlink(state.socket) end)
                end
                state.socket = nil
            end
        }
    )
    if job <= 0 then
        state.job = nil
        fail(((("Could not start " .. options.mpv) .. " (jobstart returned ") .. tostring(job)) .. ").")
        return false
    end
    state.job = job
    schedule(
        function() return connect(1) end,
        ATTEMPT_MS
    )
    return true
end
--- Send a command, queueing it when the socket is not up yet.
function ____exports.send(command, callback)
    if not ____exports.isAlive() and not ____exports.ensure() then
        return
    end
    state.requestId = state.requestId + 1
    local id = state.requestId
    if state.connected then
        if callback ~= nil then
            state.pending[id] = callback
        end
        writeLine({command = command, request_id = id})
        return
    end
    if #state.queued >= QUEUE_LIMIT then
        local dropped = __TS__ArraySplice(state.queued, 0, #state.queued - QUEUE_LIMIT + 1)
        for ____, item in ipairs(dropped) do
            if item.callback ~= nil then
                item.callback(nil, {error = "queue overflow"})
            end
        end
    end
    local ____state_queued_3 = state.queued
    ____state_queued_3[#____state_queued_3 + 1] = {command = command, id = id, callback = callback}
end
state = {
    connected = false,
    connecting = false,
    requestId = 0,
    observeId = 1000,
    pending = {},
    queued = {},
    buffer = "",
    stderr = {},
    observers = {},
    handlers = {},
    visualizer = false
}
QUEUE_LIMIT = 32
MAX_ATTEMPTS = 50
ATTEMPT_MS = 100
function ____exports.isConnected()
    return state.connected
end
--- Property read that is skipped entirely while mpv is not connected.
function ____exports.poll(name, callback)
    if not state.connected then
        return
    end
    ____exports.send(
        {"get_property", name},
        function(data, message)
            local ____callback_5 = callback
            local ____temp_4
            if message.error == "success" then
                ____temp_4 = data
            else
                ____temp_4 = nil
            end
            return ____callback_5(____temp_4)
        end
    )
end
function ____exports.getProperty(name, callback)
    ____exports.send(
        {"get_property", name},
        function(data, message)
            local ____callback_7 = callback
            local ____temp_6
            if message.error == "success" then
                ____temp_6 = data
            else
                ____temp_6 = nil
            end
            return ____callback_7(____temp_6)
        end
    )
end
function ____exports.setProperty(name, value)
    ____exports.send({"set_property", name, value})
end
--- Watch a property; mpv pushes `property-change` events.
function ____exports.observe(name, callback)
    state.observers[name] = callback
    if state.connected then
        state.observeId = state.observeId + 1
        ____exports.send({"observe_property", state.observeId, name})
    end
end
function ____exports.onEvent(handler)
    local ____state_handlers_8 = state.handlers
    ____state_handlers_8[#____state_handlers_8 + 1] = handler
end
--- Load a source and report whether mpv accepted it.
function ____exports.play(source, callback)
    if not ____exports.ensure() then
        if callback ~= nil then
            callback("mpv is unavailable.")
        end
        return
    end
    ____exports.send(
        {"loadfile", source, "replace"},
        function(_data, message)
            if message.error ~= "success" then
                local detail = ____exports.diagnostics()
                local reason = message.error == nil and "unknown error" or message.error
                local text = (((("mpv refused to play " .. source) .. " (") .. reason) .. ").") .. (detail == "" and "" or "\n" .. detail)
                fail(text)
                if callback ~= nil then
                    callback(text)
                end
                return
            end
            if callback ~= nil then
                callback(nil)
            end
        end
    )
end
function ____exports.pause()
    ____exports.send({"cycle", "pause"})
end
function ____exports.setPaused(paused)
    ____exports.setProperty("pause", paused)
end
function ____exports.stop()
    ____exports.send({"stop"})
end
function ____exports.seek(seconds)
    ____exports.send({"seek", seconds, "absolute"})
end
function ____exports.nudge(seconds)
    ____exports.send({"seek", seconds, "relative"})
end
function ____exports.setVolume(volume)
    ____exports.setProperty(
        "volume",
        math.max(
            0,
            math.min(150, volume)
        )
    )
end
function ____exports.isPlaying(callback)
    ____exports.getProperty(
        "pause",
        function(paused) return callback(paused == false) end
    )
end
--- Rebuild the `af` filter chain from the EQ/filter configuration.
function ____exports.applyAudio()
    local options = getOptions()
    local filters = {}
    if options.eq.enabled then
        local stages = {}
        do
            local index = 0
            while index < 10 do
                local gain = math.max(
                    -12,
                    math.min(12, options.eq.bands[index + 1] or 0)
                )
                local frequency = options.eq.frequencies[index + 1] or 125 * 2 ^ (index - 2)
                stages[#stages + 1] = string.format("equalizer=f=%d:t=q:w=1:g=%.1f", frequency, gain)
                index = index + 1
            end
        end
        filters[#filters + 1] = {
            name = "lavfi",
            params = {graph = table.concat(stages, ",")}
        }
    end
    if options.filter.enabled and options.filter.type ~= "off" then
        local hz = math.floor(math.max(
            20,
            math.min(20000, options.filter.frequency)
        ))
        local width = math.max(
            0.1,
            math.min(10, options.filter.width)
        )
        local kind = options.filter.type
        local graph = kind == "bandpass" and string.format("bandpass=f=%d:width_type=q:width=%.2f", hz, width) or string.format("%s=f=%d", kind, hz)
        filters[#filters + 1] = {name = "lavfi", params = {graph = graph}}
    end
    if #filters == 0 then
        ____exports.setProperty("af", "")
        return
    end
    ____exports.send(
        {"set_property", "af", filters},
        function(_data, message)
            if message.error ~= "success" then
                notifyOnce("af", ("Could not apply the audio chain (" .. (message.error or "unknown")) .. "). mpv needs FFmpeg filters for EQ.", vim.log.levels.WARN)
            end
        end
    )
end
function ____exports.isVisualizing()
    return state.visualizer
end
--- Toggle mpv's live `showcqt` spectrum in its own window.
function ____exports.visualize(enabled)
    local ____enabled_9 = enabled
    if ____enabled_9 == nil then
        ____enabled_9 = not state.visualizer
    end
    local wanted = ____enabled_9
    if not ____exports.isAlive() then
        warn("Start a track before opening the spectrum visualizer.")
        return
    end
    local graph = "[aid1]asplit=2[ao][viz];[viz]showcqt=s=960x360:r=24[vo]"
    ____exports.send(
        {"set_property", "options/lavfi-complex", wanted and graph or ""},
        function(_data, message)
            if message.error ~= "success" then
                fail("mpv could not create the spectrum. Check that its FFmpeg build includes showcqt.")
                return
            end
            state.visualizer = wanted
            ____exports.setProperty("options/force-window", wanted)
            notify(wanted and "Audio spectrum window opened." or "Audio spectrum window closed.")
        end
    )
end
function ____exports.shutdown()
    if ____exports.isAlive() and state.job ~= nil then
        ____exports.send({"quit"})
        pcall(function() return vim.fn.jobstop(state.job) end)
    end
    closePipe()
    if state.socket ~= nil then
        pcall(function() return vim.uv.fs_unlink(state.socket) end)
    end
    state.job = nil
    state.socket = nil
    state.queued = {}
    state.pending = {}
    state.visualizer = false
end
return ____exports
