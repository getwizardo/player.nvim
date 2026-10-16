-- Lua Library inline imports
local function __TS__ArrayMap(self, callbackfn, thisArg)
    local result = {}
    for i = 1, #self do
        result[i] = callbackfn(thisArg, self[i], i - 1, self)
    end
    return result
end
-- End of Lua Library inline imports
local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local ____http = require("player.http")
local getJson = ____http.getJson
local getText = ____http.getText
local ____ttml = require("player.format.ttml")
local parseTtml = ____ttml.parseTtml
local ____util = require("player.util")
local asArray = ____util.asArray
local asNumber = ____util.asNumber
local asRecord = ____util.asRecord
local asText = ____util.asText
local buildUrl = ____util.buildUrl
local matchPattern = ____util.match
local trim = ____util.trim
local upper = ____util.upper
local function base()
    return getOptions().lyric.lrc_red
end
local function timeout()
    return getOptions().lyric.timeout
end
local function readHits(payload)
    local hits = {}
    for ____, entry in ipairs(asArray(asRecord(payload).hits)) do
        do
            local __continue5
            repeat
                local record = asRecord(entry)
                local isrc = upper(trim(asText(record.isrc)))
                if isrc == "" then
                    __continue5 = true
                    break
                end
                local hit = {
                    isrc = isrc,
                    title = asText(record.title, "Unknown title"),
                    artist = asText(record.artist, "Unknown artist"),
                    album = asText(record.album)
                }
                local year = asNumber(record.year)
                local duration = asNumber(record.duration)
                local score = asNumber(record.score)
                if year ~= nil then
                    hit.year = year
                end
                if duration ~= nil then
                    hit.duration = duration
                end
                if score ~= nil then
                    hit.score = score
                end
                local cover = asText(record.cover)
                if cover ~= "" then
                    hit.cover = cover
                end
                hits[#hits + 1] = hit
                __continue5 = true
            until true
            if not __continue5 then
                break
            end
        end
    end
    return hits
end
--- Full text search: `GET /search.json?q=<query>`.
function ____exports.search(query, callback)
    local term = trim(query)
    if term == "" then
        callback({}, "Enter a song title or artist to search lrc.red.")
        return
    end
    local url = buildUrl(
        base(),
        "/search.json",
        {q = term}
    )
    getJson(
        url,
        {
            headers = {accept = "application/json"},
            timeout = timeout()
        },
        function(payload, ____error)
            if payload == nil then
                callback({}, ____error)
                return
            end
            callback(readHits(payload))
        end
    )
end
--- Weighted match used to find the ISRC of the track that is playing.
function ____exports.match(track, artist, album, duration, callback)
    if trim(track) == "" and trim(artist) == "" then
        callback({}, "lrc.red matching needs a title or an artist.")
        return
    end
    local ____buildUrl_4 = buildUrl
    local ____base_result_3 = base()
    local ____temp_0
    if trim(track) == "" then
        ____temp_0 = nil
    else
        ____temp_0 = trim(track)
    end
    local ____temp_1
    if trim(artist) == "" then
        ____temp_1 = nil
    else
        ____temp_1 = trim(artist)
    end
    local ____temp_2
    if album == nil or trim(album) == "" then
        ____temp_2 = nil
    else
        ____temp_2 = trim(album)
    end
    local url = ____buildUrl_4(
        ____base_result_3,
        "/match.json",
        {
            track = ____temp_0,
            artist = ____temp_1,
            album = ____temp_2,
            duration = duration ~= nil and duration > 0 and math.floor(duration) or nil
        }
    )
    getJson(
        url,
        {
            headers = {accept = "application/json"},
            timeout = timeout()
        },
        function(payload, ____error)
            if payload == nil then
                callback({}, ____error)
                return
            end
            callback(readHits(payload))
        end
    )
end
--- `GET /s/<ISRC>.json` — metadata, including whether word sync exists.
function ____exports.metadata(isrc, callback)
    local code = upper(trim(isrc))
    if code == "" then
        callback(nil, "An ISRC is required.")
        return
    end
    local url = buildUrl(
        base(),
        ("/s/" .. code) .. ".json"
    )
    getJson(
        url,
        {
            headers = {accept = "application/json"},
            timeout = timeout()
        },
        function(payload, ____error)
            if payload == nil then
                callback(nil, ____error)
                return
            end
            local record = asRecord(payload)
            local writers = {}
            for ____, writer in ipairs(asArray(record.songwriters)) do
                local name = asText(writer)
                if name ~= "" then
                    writers[#writers + 1] = name
                end
            end
            local files = asRecord(record.files)
            local meta = {
                isrc = asText(record.isrc, code),
                title = asText(record.title),
                artist = asText(record.artist),
                album = asText(record.album),
                duration = asNumber(record.duration) or 0,
                language = asText(record.language),
                sync = asText(record.sync),
                lines = asNumber(record.lines) or 0,
                songwriters = writers
            }
            local ttml = asText(files.ttml)
            local lrc = asText(files.lrc)
            if ttml ~= "" then
                meta.ttml = ttml
            end
            if lrc ~= "" then
                meta.lrc = lrc
            end
            callback(meta)
        end
    )
end
--- `GET /s/<ISRC>.ttml` parsed into timed lyric lines.
function ____exports.fetchTtml(isrc, callback)
    local code = upper(trim(isrc))
    if #matchPattern(code, "^[A-Z][A-Z][A-Z0-9][A-Z0-9][A-Z0-9]%d%d%d%d%d%d%d$") == 0 then
        callback(nil, ("\"" .. isrc) .. "\" is not a 12 character ISRC (for example GBUM71029604).")
        return
    end
    local url = buildUrl(
        base(),
        ("/s/" .. code) .. ".ttml"
    )
    getText(
        url,
        {
            headers = {accept = "application/ttml+xml, application/xml"},
            timeout = timeout()
        },
        function(body, ____error)
            if body == nil then
                callback(nil, ____error)
                return
            end
            local document = parseTtml(body)
            if #document.lines == 0 then
                callback(nil, ("lrc.red returned a TTML document with no timed lines for " .. code) .. ".")
                return
            end
            callback(document)
        end
    )
end
--- Turn catalogue hits into selectable lyric candidates.
function ____exports.toCandidates(hits)
    return __TS__ArrayMap(
        hits,
        function(____, hit)
            local candidate = {
                provider = "lrc.red",
                id = hit.isrc,
                title = hit.title,
                artist = hit.artist,
                album = hit.album,
                isrc = hit.isrc
            }
            if hit.duration ~= nil then
                candidate.duration = hit.duration
            end
            if hit.score ~= nil then
                candidate.score = hit.score
            end
            if hit.year ~= nil then
                candidate.year = hit.year
            end
            return candidate
        end
    )
end
return ____exports
