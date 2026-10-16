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
local findPattern = ____util.findPattern
local trim = ____util.trim
local APP_NAME = "player.nvim"
local host
local function discovery()
    return getOptions().search.audius
end
local function timeout()
    return getOptions().search.timeout
end
--- Pick an API host (cached) and hand it to `callback`.
local function withHost(callback)
    if host ~= nil then
        callback(host)
        return
    end
    getJson(
        discovery(),
        {
            headers = {accept = "application/json"},
            timeout = timeout()
        },
        function(payload, ____error)
            if payload == nil then
                callback(nil, ____error)
                return
            end
            for ____, entry in ipairs(asArray(asRecord(payload).data)) do
                local candidate = asText(entry)
                if findPattern(candidate, "^https?://") ~= nil then
                    host = candidate
                    callback(host)
                    return
                end
            end
            callback(nil, "The Audius discovery endpoint returned no usable host.")
        end
    )
end
function ____exports.search(query, callback)
    local term = trim(query)
    if term == "" then
        callback({}, "Enter a search term for Audius.")
        return
    end
    withHost(function(base, ____error)
        if base == nil then
            callback({}, ____error)
            return
        end
        local limit = getOptions().search.limit > 0 and getOptions().search.limit or 12
        local url = buildUrl(base, "/v1/tracks/search", {query = term, app_name = APP_NAME})
        getJson(
            url,
            {
                headers = {accept = "application/json"},
                timeout = timeout()
            },
            function(payload, err)
                if payload == nil then
                    callback({}, err)
                    return
                end
                local tracks = {}
                for ____, entry in ipairs(asArray(asRecord(payload).data)) do
                    do
                        local __continue17
                        repeat
                            local track = asRecord(entry)
                            local id = asText(track.id)
                            if id == "" then
                                __continue17 = true
                                break
                            end
                            local result = {
                                provider = "Audius",
                                title = asText(track.title, "Untitled"),
                                artist = asText(
                                    asRecord(track.user).name,
                                    asText(asRecord(track.user).handle)
                                ),
                                url = buildUrl(base, ("/v1/tracks/" .. id) .. "/stream", {app_name = APP_NAME})
                            }
                            local duration = asNumber(track.duration)
                            if duration ~= nil and duration > 0 then
                                result.duration = duration
                            end
                            local genre = asText(track.genre)
                            if genre ~= "" then
                                result.album = genre
                            end
                            tracks[#tracks + 1] = result
                            if #tracks >= limit then
                                break
                            end
                            __continue17 = true
                        until true
                        if not __continue17 then
                            break
                        end
                    end
                end
                callback(tracks)
            end
        )
    end)
end
return ____exports
