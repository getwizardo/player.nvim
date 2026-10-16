--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____helper = require("player.helper")
local helperScript = ____helper.helperScript
local ____config = require("player.config")
local options = ____config.options
local ____mpv = require("player.mpv")
local describe = ____mpv.describe
--- Run the health checks.
function ____exports.check()
    local settings = options()
    vim.health.start("player.nvim")
    if vim.fn.executable(settings.mpv) == 1 then
        vim.health.ok("mpv is installed: " .. settings.mpv)
    else
        vim.health.error("mpv was not found. Install mpv or set `mpv` in the plugin options.")
    end
    if vim.fn.executable(settings.yt_dlp) == 1 then
        vim.health.ok("yt-dlp is installed: " .. settings.yt_dlp)
    else
        vim.health.warn("yt-dlp was not found. Search and download need yt-dlp.")
    end
    if vim.fn.executable(settings.node) == 1 then
        vim.health.ok("Node.js is installed: " .. settings.node)
    else
        vim.health.warn("Node.js was not found. Lyric search and translation need Node.js.")
    end
    if vim.fn.filereadable(helperScript()) == 1 then
        vim.health.ok("The lyrics helper is compiled: " .. helperScript())
    else
        vim.health.error("The lyrics helper is missing. Run `npm ci && npm run build` in the plugin directory.")
    end
    if vim.fn.executable("ffmpeg") == 1 then
        vim.health.ok("ffmpeg is installed, the equalizer and the spectrum should work.")
    else
        vim.health.warn("ffmpeg was not found. The equalizer, the filters and the spectrum need it.")
    end
    if settings.translator.url == "" or string.find(settings.translator.url, "^https?://") == nil then
        vim.health.warn("The translator URL is not an http(s) URL: " .. settings.translator.url)
    else
        vim.health.ok("The translator endpoint is " .. settings.translator.url)
    end
    if vim.fn.executable("fd") == 1 then
        vim.health.ok("fd is installed, the local file picker uses it.")
    else
        vim.health.info("fd was not found, the local file picker falls back to `find`.")
    end
    local cache = vim.fn.stdpath("cache") .. "/player.nvim"
    if vim.fn.isdirectory(cache) == 1 then
        vim.health.ok("The mpv socket directory exists: " .. cache)
    else
        vim.health.warn(("The mpv socket directory " .. cache) .. " does not exist yet; it is created when mpv starts.")
    end
    vim.health.info("The lyric services are LRCLIB, MusicBrainz, iTunes and lrc.red for the TTML documents.")
    vim.health.info(("The mpv process is " .. describe()) .. ".")
end
return ____exports
