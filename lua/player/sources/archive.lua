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

local function __TS__ArraySort(self, compareFn)
    if compareFn ~= nil then
        table.sort(
            self,
            function(a, b) return compareFn(nil, a, b) < 0 end
        )
    else
        table.sort(self)
    end
    return self
end
-- End of Lua Library inline imports
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
local pathEncode = ____util.pathEncode
local trim = ____util.trim
--- Derivative/original formats worth offering for playback.
local AUDIO_FORMATS = {
    "VBR MP3",
    "128Kbps MP3",
    "MP3",
    "64Kbps MP3",
    "Flac",
    "24bit Flac",
    "Ogg Vorbis",
    "Apple Lossless",
    "WAV"
}
local function base()
    return getOptions().search.archive
end
local function timeout()
    return getOptions().search.timeout
end
--- Restrict the search to audio items and skip the per-file sub-items.
local function audioQuery(query)
    return query .. " AND mediatype:(audio) AND !format:(Cue Sheet)"
end
function ____exports.search(query, callback)
    local term = trim(query)
    if term == "" then
        callback({}, "Enter a search term for the Internet Archive.")
        return
    end
    local limit = getOptions().search.limit > 0 and getOptions().search.limit or 12
    local url = buildUrl(
        base(),
        "/advancedsearch.php",
        {
            q = audioQuery(term),
            rows = limit,
            page = 1,
            output = "json"
        }
    ) .. "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=year"
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
            local docs = asArray(asRecord(asRecord(payload).response).docs)
            local tracks = {}
            for ____, entry in ipairs(docs) do
                do
                    local __continue9
                    repeat
                        local doc = asRecord(entry)
                        local identifier = asText(doc.identifier)
                        if identifier == "" then
                            __continue9 = true
                            break
                        end
                        local title = asText(doc.title, identifier)
                        local track = {
                            provider = "Archive",
                            title = title,
                            artist = asText(
                                doc.creator,
                                asText(doc.collection)
                            ),
                            url = buildUrl(
                                base(),
                                ("/download/" .. identifier) .. "/"
                            )
                        }
                        local year = asNumber(doc.year)
                        if year ~= nil then
                            track.album = tostring(year)
                        end
                        tracks[#tracks + 1] = track
                        __continue9 = true
                    until true
                    if not __continue9 then
                        break
                    end
                end
            end
            callback(tracks)
        end
    )
end
--- List the playable audio files inside an archive item.
function ____exports.tracks(identifier, callback)
    local url = buildUrl(
        base(),
        "/metadata/" .. identifier
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
            local files = asArray(asRecord(payload).files)
            local found = {}
            for ____, entry in ipairs(files) do
                do
                    local __continue16
                    repeat
                        local file = asRecord(entry)
                        local format = asText(file.format)
                        local name = asText(file.name)
                        if name == "" or not __TS__ArrayIncludes(AUDIO_FORMATS, format) then
                            __continue16 = true
                            break
                        end
                        local track = {
                            provider = "Archive",
                            title = asText(file.title, name),
                            artist = asText(
                                file.creator,
                                asText(file.artist)
                            ),
                            url = ((buildUrl(
                                base(),
                                "/download/"
                            ) .. pathEncode(identifier)) .. "/") .. pathEncode(name)
                        }
                        local length = tonumber(asText(file.length))
                        if length ~= nil and length > 0 then
                            track.duration = length
                        end
                        local album = asText(file.album)
                        if album ~= "" then
                            track.album = album
                        end
                        found[#found + 1] = track
                        __continue16 = true
                    until true
                    if not __continue16 then
                        break
                    end
                end
            end
            __TS__ArraySort(
                found,
                function(____, a, b) return a.title < b.title and -1 or (a.title > b.title and 1 or 0) end
            )
            callback(found)
        end
    )
end
return ____exports
