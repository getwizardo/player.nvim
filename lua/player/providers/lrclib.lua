-- Lua Library inline imports
local function __TS__ArrayMap(self, callbackfn, thisArg)
    local result = {}
    for i = 1, #self do
        result[i] = callbackfn(thisArg, self[i], i - 1, self)
    end
    return result
end

local function __TS__ArrayFilter(self, callbackfn, thisArg)
    local result = {}
    local len = 0
    for i = 1, #self do
        if callbackfn(thisArg, self[i], i - 1, self) then
            len = len + 1
            result[len] = self[i]
        end
    end
    return result
end
-- End of Lua Library inline imports
local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local ____http = require("player.http")
local getJson = ____http.getJson
local ____lrc = require("player.format.lrc")
local parseLrc = ____lrc.parseLrc
local ____util = require("player.util")
local asArray = ____util.asArray
local asNumber = ____util.asNumber
local asRecord = ____util.asRecord
local asText = ____util.asText
local buildUrl = ____util.buildUrl
local splitLines = ____util.splitLines
local trim = ____util.trim
local function base()
    return getOptions().lyric.lrclib
end
local function readRecord(value)
    local record = asRecord(value)
    local id = asNumber(record.id)
    if id == nil then
        return nil
    end
    return {
        id = id,
        trackName = asText(
            record.trackName,
            asText(record.name, "Unknown title")
        ),
        artistName = asText(record.artistName, "Unknown artist"),
        albumName = asText(record.albumName),
        duration = asNumber(record.duration) or 0,
        instrumental = record.instrumental == true,
        hasWordSync = record.hasWordSync == true,
        syncedLyrics = asText(record.syncedLyrics),
        plainLyrics = asText(record.plainLyrics)
    }
end
function ____exports.search(query, callback)
    local term = trim(query)
    if term == "" then
        callback({}, "Enter a song title or artist to search LRCLIB.")
        return
    end
    local url = buildUrl(
        base(),
        "/api/search",
        {q = term}
    )
    getJson(
        url,
        {
            headers = {accept = "application/json"},
            timeout = getOptions().lyric.timeout
        },
        function(payload, ____error)
            if payload == nil then
                callback({}, ____error)
                return
            end
            local candidates = {}
            for ____, entry in ipairs(asArray(payload)) do
                do
                    local __continue9
                    repeat
                        local record = readRecord(entry)
                        if record == nil or record.instrumental then
                            __continue9 = true
                            break
                        end
                        local candidate = {
                            provider = "LRCLIB",
                            id = tostring(record.id),
                            title = record.trackName,
                            artist = record.artistName,
                            album = record.albumName,
                            sync = record.syncedLyrics ~= "" and "line" or "none"
                        }
                        if record.duration > 0 then
                            candidate.duration = record.duration
                        end
                        candidates[#candidates + 1] = candidate
                        __continue9 = true
                    until true
                    if not __continue9 then
                        break
                    end
                end
            end
            callback(candidates)
        end
    )
end
function ____exports.getById(id, callback)
    getJson(
        buildUrl(
            base(),
            "/api/get/" .. tostring(id)
        ),
        {
            headers = {accept = "application/json"},
            timeout = getOptions().lyric.timeout
        },
        function(payload, ____error)
            if payload == nil then
                callback(nil, ____error)
                return
            end
            callback(readRecord(payload))
        end
    )
end
function ____exports.getBySignature(track, artist, album, duration, callback)
    if trim(track) == "" or trim(artist) == "" then
        callback(nil, "LRCLIB signature lookup needs a title and an artist.")
        return
    end
    local ____buildUrl_4 = buildUrl
    local ____base_result_3 = base()
    local ____trim_result_1 = trim(track)
    local ____trim_result_2 = trim(artist)
    local ____temp_0
    if album == nil or trim(album) == "" then
        ____temp_0 = nil
    else
        ____temp_0 = trim(album)
    end
    local url = ____buildUrl_4(
        ____base_result_3,
        "/api/get",
        {
            track_name = ____trim_result_1,
            artist_name = ____trim_result_2,
            album_name = ____temp_0,
            duration = duration ~= nil and duration > 0 and math.floor(duration) or nil
        }
    )
    getJson(
        url,
        {
            headers = {accept = "application/json"},
            timeout = getOptions().lyric.timeout
        },
        function(payload, ____error)
            if payload == nil then
                callback(nil, ____error)
                return
            end
            callback(readRecord(payload))
        end
    )
end
--- Resolve a record's text into timed (or plain) lyric lines.
function ____exports.linesFrom(record)
    if record.syncedLyrics ~= "" then
        local parsed = parseLrc(record.syncedLyrics)
        if #parsed.lines > 0 then
            return {lines = parsed.lines, source = "LRCLIB · synced LRC"}
        end
    end
    local plain = __TS__ArrayMap(
        __TS__ArrayFilter(
            __TS__ArrayMap(
                splitLines(record.plainLyrics),
                function(____, text) return trim(text) end
            ),
            function(____, text) return text ~= "" end
        ),
        function(____, text) return {start = 0, finish = 0, text = text} end
    )
    return {lines = plain, source = "LRCLIB · plain text"}
end
return ____exports
