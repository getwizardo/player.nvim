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
local ____util = require("player.util")
local asArray = ____util.asArray
local asNumber = ____util.asNumber
local asRecord = ____util.asRecord
local asText = ____util.asText
local buildUrl = ____util.buildUrl
local match = ____util.match
local trim = ____util.trim
--- The highest-bitrate entry of the wrapper's `downloadUrl` list.
local function streamUrl(song)
    local best = ""
    local bestRate = -1
    for ____, entry in ipairs(asArray(song.downloadUrl)) do
        do
            local __continue3
            repeat
                local item = asRecord(entry)
                local url = asText(item.url)
                if url == "" then
                    __continue3 = true
                    break
                end
                local rate = tonumber(match(
                    asText(item.quality),
                    "(%d+)"
                )[1] or "") or -1
                if rate >= bestRate then
                    bestRate = rate
                    best = url
                end
                __continue3 = true
            until true
            if not __continue3 then
                break
            end
        end
    end
    return best
end
local function base()
    return getOptions().lyric.jiosaavn_api
end
local function primaryArtists(song)
    local artists = asRecord(song.artists)
    local names = {}
    for ____, entry in ipairs(asArray(artists.primary)) do
        local name = asText(asRecord(entry).name)
        if name ~= "" then
            names[#names + 1] = name
        end
    end
    if #names > 0 then
        return table.concat(names, ", ")
    end
    return asText(
        song.primaryArtists,
        asText(song.singers)
    )
end
local function readSongs(payload)
    local results = asArray(asRecord(asRecord(payload).data).results)
    local songs = {}
    for ____, entry in ipairs(results) do
        do
            local __continue14
            repeat
                local song = asRecord(entry)
                local url = asText(song.url)
                local id = asText(song.id)
                if url == "" and id == "" then
                    __continue14 = true
                    break
                end
                songs[#songs + 1] = {
                    id = id,
                    title = asText(
                        song.name,
                        asText(song.title, "Unknown title")
                    ),
                    artist = primaryArtists(song) or "Unknown artist",
                    album = asText(
                        asRecord(song.album).name,
                        asText(song.album)
                    ),
                    year = asText(song.year),
                    duration = asNumber(song.duration) or 0,
                    language = asText(song.language),
                    hasLyrics = song.hasLyrics == true,
                    url = url,
                    stream = streamUrl(song)
                }
                __continue14 = true
            until true
            if not __continue14 then
                break
            end
        end
    end
    return songs
end
function ____exports.search(query, callback)
    local endpoint = trim(base())
    if endpoint == "" then
        callback({}, "JioSaavn search is disabled (lyric.jiosaavn_api is empty).")
        return
    end
    local term = trim(query)
    if term == "" then
        callback({}, "Enter a song title or artist to search JioSaavn.")
        return
    end
    local url = buildUrl(endpoint, "/api/search/songs", {query = term, page = 0, limit = 10})
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
            callback(readSongs(payload))
        end
    )
end
function ____exports.toCandidates(songs)
    return __TS__ArrayMap(
        songs,
        function(____, song)
            local candidate = {
                provider = "JioSaavn",
                id = song.id,
                title = song.title,
                artist = song.artist,
                album = song.album,
                sync = "none"
            }
            if song.url ~= "" then
                candidate.url = song.url
            end
            if song.duration > 0 then
                candidate.duration = song.duration
            end
            if song.language ~= "" then
                candidate.language = song.language
            end
            local year = tonumber(song.year)
            if year ~= nil then
                candidate.year = year
            end
            return candidate
        end
    )
end
function ____exports.toTracks(songs)
    local tracks = {}
    for ____, song in ipairs(songs) do
        do
            local __continue29
            repeat
                if song.stream == "" and song.url == "" then
                    __continue29 = true
                    break
                end
                local track = {provider = "JioSaavn", title = song.title, artist = song.artist, url = song.stream ~= "" and song.stream or song.url}
                if song.album ~= "" then
                    track.album = song.album
                end
                if song.duration > 0 then
                    track.duration = song.duration
                end
                tracks[#tracks + 1] = track
                __continue29 = true
            until true
            if not __continue29 then
                break
            end
        end
    end
    return tracks
end
return ____exports
