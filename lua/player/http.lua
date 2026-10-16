-- Lua Library inline imports
local function __TS__ArrayPush(self, ...)
    local items = {...}
    local len = #self
    for i = 1, #items do
        len = len + 1
        self[len] = items[i]
    end
    return len
end

local function __TS__ObjectAssign(target, ...)
    local sources = {...}
    for i = 1, #sources do
        local source = sources[i]
        if type(source) == "table" then
            for key in pairs(source) do
                target[key] = source[key]
            end
        end
    end
    return target
end
-- End of Lua Library inline imports
local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local ____util = require("player.util")
local findPattern = ____util.findPattern
local notify = ____util.notify
local replace = ____util.replace
local splitLines = ____util.splitLines
local sub = ____util.sub
local trim = ____util.trim
____exports.USER_AGENT = "player.nvim/1.0 (https://github.com/getwizardo/player.nvim)"
local cachedClient
--- The first available HTTP client, or `undefined` when neither exists.
function ____exports.client()
    if cachedClient ~= nil then
        return cachedClient
    end
    local preferred = getOptions().http
    if preferred ~= "" and vim.fn.executable(preferred) == 1 then
        cachedClient = preferred
        return cachedClient
    end
    for ____, candidate in ipairs({"curl", "wget"}) do
        if vim.fn.executable(candidate) == 1 then
            cachedClient = candidate
            return cachedClient
        end
    end
    return nil
end
local function curlArgs(url, options)
    local args = {
        "curl",
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        tostring(options.timeout or 20),
        "--request",
        options.body ~= nil and "POST" or (options.method or "GET"),
        "--header",
        "user-agent: " .. ____exports.USER_AGENT,
        "--write-out",
        "\n%{http_code}"
    }
    if options.headers ~= nil then
        for key in pairs(options.headers) do
            __TS__ArrayPush(args, "--header", (key .. ": ") .. options.headers[key])
        end
    end
    if options.body ~= nil then
        __TS__ArrayPush(args, "--data", options.body)
    end
    args[#args + 1] = url
    return args
end
local function wgetArgs(url, options)
    local args = {
        "wget",
        "--quiet",
        "--tries=1",
        "--timeout=" .. tostring(options.timeout or 20),
        "--header=user-agent: " .. ____exports.USER_AGENT,
        "--output-document=-"
    }
    if options.headers ~= nil then
        for key in pairs(options.headers) do
            args[#args + 1] = (("--header=" .. key) .. ": ") .. options.headers[key]
        end
    end
    if options.body ~= nil then
        __TS__ArrayPush(args, "--header=content-type: application/json", "--post-data=" .. options.body)
    end
    args[#args + 1] = url
    return args
end
--- curl appends `\n%{http_code}` after the body: split the status back off.
local function splitStatus(stdout)
    local boundary = findPattern(stdout, "\n[^\n]*$")
    if boundary == nil then
        return {status = 200, body = stdout}
    end
    local body = sub(stdout, 1, boundary - 1)
    local status = tonumber(replace(
        sub(stdout, boundary + 1),
        "%s+",
        ""
    )) or 0
    return {status = status, body = body}
end
function ____exports.request(url, options, callback)
    local opts = options or ({})
    local tool = ____exports.client()
    if tool == nil then
        callback(nil, "No HTTP client found. Install curl (or wget) so player.nvim can reach lyric and search services.")
        return
    end
    local command = tool == "wget" and wgetArgs(url, opts) or curlArgs(url, opts)
    command[1] = tool
    vim.system(
        command,
        {text = true, timeout = ((opts.timeout or 20) + 5) * 1000},
        function(result)
            vim.schedule(function()
                if result.code ~= 0 then
                    local stderr = trim(result.stderr or "")
                    local detail = splitLines(stderr)[1] or "exit code " .. tostring(result.code)
                    callback(nil, ((((tool .. " failed for ") .. url) .. " (") .. detail) .. ")")
                    return
                end
                local stdout = result.stdout or ""
                if tool == "wget" then
                    callback({status = 200, body = stdout})
                    return
                end
                callback(splitStatus(stdout))
            end)
        end
    )
end
local function describe(url, status)
    if status == 404 then
        return ("nothing found at " .. url) .. " (404)"
    end
    if status == 429 then
        return ("rate limited by " .. url) .. " (429), try again shortly"
    end
    return (url .. " returned HTTP ") .. tostring(status)
end
--- GET a URL and decode JSON, reporting either the value or an error message.
function ____exports.getJson(url, options, callback)
    ____exports.request(
        url,
        {
            timeout = options and options.timeout,
            headers = __TS__ObjectAssign({accept = "application/json"}, options and options.headers or ({}))
        },
        function(response, ____error)
            if response == nil then
                callback(nil, ____error)
                return
            end
            if response.status < 200 or response.status >= 300 then
                callback(
                    nil,
                    describe(url, response.status)
                )
                return
            end
            local result = {pcall(function() return vim.json.decode(response.body) end)}
            local ok = result[1]
            local decoded = result[2]
            if not ok then
                callback(nil, "Could not decode JSON from " .. url)
                return
            end
            callback(decoded)
        end
    )
end
--- GET a URL and hand back the raw text body (TTML, LRC, ...).
function ____exports.getText(url, options, callback)
    ____exports.request(
        url,
        {timeout = options and options.timeout, headers = options and options.headers},
        function(response, ____error)
            if response == nil then
                callback(nil, ____error)
                return
            end
            if response.status < 200 or response.status >= 300 then
                callback(
                    nil,
                    describe(url, response.status)
                )
                return
            end
            callback(response.body)
        end
    )
end
--- POST a JSON document and decode the JSON reply.
function ____exports.postJson(url, body, options, callback)
    local payload = vim.json.encode(body)
    ____exports.request(
        url,
        {
            body = payload,
            timeout = options and options.timeout,
            headers = __TS__ObjectAssign({accept = "application/json", ["content-type"] = "application/json"}, options and options.headers or ({}))
        },
        function(response, ____error)
            if response == nil then
                callback(nil, ____error)
                return
            end
            if response.status < 200 or response.status >= 300 then
                callback(
                    nil,
                    describe(url, response.status)
                )
                return
            end
            local result = {pcall(function() return vim.json.decode(response.body) end)}
            local ok = result[1]
            local decoded = result[2]
            if not ok then
                callback(nil, "Could not decode JSON from " .. url)
                return
            end
            callback(decoded)
        end
    )
end
--- One-shot health check used by `:PlayerDoctor`.
function ____exports.check(callback)
    local summary = {}
    local tool = ____exports.client()
    if tool == nil then
        summary[#summary + 1] = "http: no curl or wget on PATH"
        callback(summary)
        return
    end
    summary[#summary + 1] = "http: using " .. tool
    ____exports.getText(
        "https://lrc.red/docs",
        {timeout = 10},
        function(text, ____error)
            summary[#summary + 1] = ____error ~= nil and "lrc.red: " .. ____error or ("lrc.red: reachable (" .. tostring(#(text or ""))) .. " bytes)"
            ____exports.request(
                "https://lrclib.net/api/search?q=player",
                {timeout = 10, headers = {accept = "application/json"}},
                function(response, err)
                    summary[#summary + 1] = err ~= nil and "lrclib: " .. err or "lrclib: HTTP " .. tostring(response and response.status or 0)
                    notify(table.concat(summary, "\n"))
                    callback(summary)
                end
            )
        end
    )
end
return ____exports
