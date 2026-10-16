-- Lua Library inline imports
local function __TS__ArrayIncludes(self, searchElement, fromIndex)
    if fromIndex == nil then
        fromIndex = 0
    end
    local len = #self
    local k = fromIndex
    if fromIndex < 0 then
        k = len + fromIndex
    end
    if k < 0 then
        k = 0
    end
    for i = k + 1, len do
        if self[i] == searchElement then
            return true
        end
    end
    return false
end
-- End of Lua Library inline imports
local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local archive = require("player.sources.archive")
local audius = require("player.sources.audius")
local invidious = require("player.sources.invidious")
local jiosaavn = require("player.providers.jiosaavn")
local ytdlp = require("player.sources.ytdlp")
local ____util = require("player.util")
local endsWith = ____util.endsWith
local formatTime = ____util.formatTime
local lower = ____util.lower
local match = ____util.match
local notify = ____util.notify
local trim = ____util.trim
____exports.SOURCES = {
    "ytdlp",
    "youtube",
    "ytmusic",
    "soundcloud",
    "archive",
    "audius",
    "invidious",
    "jiosaavn"
}
local function prefixFor(source)
    local options = getOptions().search
    if source == "youtube" then
        return "ytsearch"
    end
    if source == "ytmusic" then
        return "ytmsearch"
    end
    if source == "soundcloud" then
        return "scsearch"
    end
    return options.youtube == "" and "ytsearch" or options.youtube
end
local function sourceFunction(source)
    local limit = getOptions().search.limit
    if source == "ytdlp" or source == "youtube" or source == "ytmusic" or source == "soundcloud" then
        local prefix = prefixFor(source)
        return function(query, callback) return ytdlp.search(prefix, query, limit, callback) end
    end
    if source == "archive" then
        return function(query, callback) return archive.search(query, callback) end
    end
    if source == "audius" then
        return function(query, callback) return audius.search(query, callback) end
    end
    if source == "invidious" then
        return function(query, callback) return invidious.search(query, callback) end
    end
    if source == "jiosaavn" then
        return function(query, callback) return jiosaavn.search(
            query,
            function(songs, ____error)
                if #songs == 0 then
                    callback({}, ____error)
                    return
                end
                callback(jiosaavn.toTracks(songs))
            end
        ) end
    end
    return nil
end
--- Query every requested source and merge what came back.
function ____exports.run(request, callback)
    local query = trim(request.query)
    if query == "" then
        callback({}, {"Enter a search term."})
        return
    end
    local wanted = request.sources or getOptions().search.sources
    local names = {}
    for ____, name in ipairs(wanted) do
        local key = lower(trim(name))
        if key ~= "" and not __TS__ArrayIncludes(names, key) then
            names[#names + 1] = key
        end
    end
    if #names == 0 then
        callback({}, {"No search sources are enabled. Set search.sources."})
        return
    end
    local tracks = {}
    local errors = {}
    local pending = #names
    local function finish()
        pending = pending - 1
        if pending > 0 then
            return
        end
        local seen = {}
        local unique = {}
        for ____, track in ipairs(tracks) do
            do
                local __continue27
                repeat
                    if seen[track.url] == true then
                        __continue27 = true
                        break
                    end
                    seen[track.url] = true
                    unique[#unique + 1] = track
                    __continue27 = true
                until true
                if not __continue27 then
                    break
                end
            end
        end
        callback(unique, errors)
    end
    for ____, name in ipairs(names) do
        do
            local __continue30
            repeat
                local search = sourceFunction(name)
                if search == nil then
                    errors[#errors + 1] = ("Unknown search source \"" .. name) .. "\"."
                    finish()
                    __continue30 = true
                    break
                end
                search(
                    query,
                    function(results, ____error)
                        if ____error ~= nil then
                            errors[#errors + 1] = (name .. ": ") .. ____error
                        end
                        for ____, track in ipairs(results) do
                            tracks[#tracks + 1] = track
                        end
                        finish()
                    end
                )
                __continue30 = true
            until true
            if not __continue30 then
                break
            end
        end
    end
end
--- An Archive result points at an item; expand it into playable files.
function ____exports.resolve(track, callback)
    if track.provider ~= "Archive" or not endsWith(track.url, "/") then
        callback({track})
        return
    end
    local identifier = match(track.url, "/download/([^/]+)/$")[1]
    if identifier == nil then
        callback({track})
        return
    end
    notify(("Listing audio files in " .. identifier) .. "…")
    archive.tracks(
        identifier,
        function(files, ____error)
            if #files == 0 then
                if ____error ~= nil then
                    notify(____error, vim.log.levels.WARN)
                end
                callback({track})
                return
            end
            callback(files)
        end
    )
end
--- `title — artist [m:ss] · source` used by pickers.
function ____exports.format(track)
    local duration = track.duration ~= nil and (" [" .. formatTime(track.duration)) .. "]" or ""
    local artist = track.artist == "" and "" or " — " .. track.artist
    return (((track.title .. artist) .. duration) .. " · ") .. track.provider
end
return ____exports
