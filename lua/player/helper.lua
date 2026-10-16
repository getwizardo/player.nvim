--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____config = require("player.config")
local options = ____config.options
local ____lua_2Dutil = require("player.lua-util")
local attempt = ____lua_2Dutil.attempt
--- Absolute path of the plugin root (the directory that holds `dist/`).
function ____exports.pluginRoot()
    local info = debug:getinfo(1, "S")
    local source = info and info.source and info.source or ""
    if string.sub(source, 1, 1) == "@" then
        return vim.fn.fnamemodify(
            string.sub(source, 2),
            ":p:h:h:h"
        )
    end
    return vim.fn.fnamemodify(source, ":p:h:h:h")
end
--- Absolute path of the compiled helper entry point.
function ____exports.helperScript()
    return ____exports.pluginRoot() .. "/dist/lyrics.js"
end
--- True when Node.js and the compiled helper are both available.
function ____exports.helperAvailable()
    return vim.fn.executable(options().node) == 1 and vim.fn.filereadable(____exports.helperScript()) == 1
end
--- Run the helper.
-- 
-- `env` is merged into the *current* environment: replacing it wholesale would
-- drop `PATH` and the child process could not find `node` at all.
function ____exports.helperCall(args, stdin, callback, env, timeout)
    if not ____exports.helperAvailable() then
        callback(nil, "Lyrics search and translation need Node.js and the compiled dist/lyrics.js helper.")
        return
    end
    local command = {
        options().node,
        ____exports.helperScript()
    }
    do
        local index = 0
        while index < #args do
            command[#command + 1] = args[index + 1]
            index = index + 1
        end
    end
    local systemOptions = {text = true}
    if stdin ~= nil then
        systemOptions.stdin = stdin
    end
    if timeout ~= nil then
        systemOptions.timeout = timeout
    end
    if env ~= nil then
        local merged = vim.fn.environ()
        for key in pairs(env) do
            merged[key] = env[key]
        end
        systemOptions.env = merged
    end
    vim.system(
        command,
        systemOptions,
        function(result)
            vim.schedule(function()
                if result.code ~= 0 then
                    local message = result.stderr ~= "" and result.stderr or "The lyrics helper failed."
                    callback(nil, message)
                    return
                end
                local decoded = attempt(function()
                    return vim.json.decode(result.stdout)
                end)
                if not decoded.ok then
                    callback(nil, "Could not decode the lyrics helper response.")
                    return
                end
                callback(decoded.value)
            end)
        end
    )
end
return ____exports
