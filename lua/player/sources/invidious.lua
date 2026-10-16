local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local ____http = require("player.http")
local getJson = ____http.getJson
local ____util = require("player.util")
local asArray = ____util.asArray
local asNumber = ____util.asNumber
local asRecord = ____util.asRecord
local asText = ____util.asText
local buildUrl = ____util.buildUrl
local formatTime = ____util.formatTime
local trim = ____util.trim
function ____exports.enabled()
    return getOptions().search.invidious ~= ""
end
function ____exports.search(query, callback)
    local instance = getOptions().search.invidious
    if instance == "" then
        callback({}, "Set search.invidious to an instance URL to use this source.")
        return
    end
    local term = trim(query)
    if term == "" then
        callback({}, "Enter a search term.")
        return
    end
    local url = buildUrl(instance, "/api/v1/search", {q = term, type = "music"})
    getJson(
        url,
        {
            headers = {accept = "application/json"},
            timeout = getOptions().search.timeout
        },
        function(payload, ____error)
            if payload == nil then
                callback({}, ____error)
                return
            end
            local limit = getOptions().search.limit > 0 and getOptions().search.limit or 12
            local tracks = {}
            for ____, entry in ipairs(asArray(payload)) do
                do
                    local __continue8
                    repeat
                        local video = asRecord(entry)
                        local id = asText(video.videoId)
                        if id == "" then
                            __continue8 = true
                            break
                        end
                        local track = {
                            provider = asText(video.author, "Invidious"),
                            title = asText(video.title, id),
                            artist = asText(video.author),
                            url = "https://www.youtube.com/watch?v=" .. id
                        }
                        local duration = asNumber(video.lengthSeconds)
                        if duration ~= nil and duration > 0 then
                            track.duration = duration
                        end
                        tracks[#tracks + 1] = track
                        if #tracks >= limit then
                            break
                        end
                        __continue8 = true
                    until true
                    if not __continue8 then
                        break
                    end
                end
            end
            callback(tracks)
        end
    )
end
--- `title — artist [m:ss]` used by pickers.
function ____exports.format(track)
    local duration = track.duration ~= nil and (" [" .. formatTime(track.duration)) .. "]" or ""
    local artist = track.artist == "" and "" or " — " .. track.artist
    return (track.title .. artist) .. duration
end
return ____exports
