local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local ____util = require("player.util")
local asArray = ____util.asArray
local asNumber = ____util.asNumber
local asRecord = ____util.asRecord
local asText = ____util.asText
local decodeJson = ____util.decodeJson
local fail = ____util.fail
local findPattern = ____util.findPattern
local notify = ____util.notify
local splitLines = ____util.splitLines
local trim = ____util.trim
--- Known prefixes, used for command completion.
____exports.PREFIXES = {
    "ytsearch",
    "ytmsearch",
    "scsearch",
    "bilisearch",
    "mixcloud",
    "bandcamp"
}
function ____exports.available()
    return vim.fn.executable(getOptions().yt_dlp) == 1
end
local function readEntries(payload)
    local tracks = {}
    for ____, entry in ipairs(asArray(asRecord(payload).entries)) do
        do
            local __continue4
            repeat
                local record = asRecord(entry)
                local id = asText(record.id)
                local url = asText(record.webpage_url)
                if url == "" then
                    url = asText(record.original_url)
                end
                if url == "" then
                    url = asText(record.url)
                end
                if url == "" and id ~= "" then
                    url = "https://www.youtube.com/watch?v=" .. id
                end
                if url == "" then
                    __continue4 = true
                    break
                end
                local track = {
                    provider = asText(record.extractor_key, "yt-dlp"),
                    title = asText(
                        record.title,
                        asText(record.fulltitle, id == "" and "Untitled" or id)
                    ),
                    artist = asText(
                        record.uploader,
                        asText(
                            record.channel,
                            asText(record.creator)
                        )
                    ),
                    url = url
                }
                local duration = asNumber(record.duration)
                if duration ~= nil and duration > 0 then
                    track.duration = duration
                end
                local album = asText(record.album)
                if album ~= "" then
                    track.album = album
                end
                tracks[#tracks + 1] = track
                __continue4 = true
            until true
            if not __continue4 then
                break
            end
        end
    end
    return tracks
end
--- Search one yt-dlp source and return playable URLs.
function ____exports.search(prefix, query, limit, callback)
    if not ____exports.available() then
        callback(
            {},
            getOptions().yt_dlp .. " is required for this source. Install yt-dlp or disable it in search.sources."
        )
        return
    end
    local count = limit > 0 and limit or 10
    local command = {
        getOptions().yt_dlp,
        "--flat-playlist",
        "--dump-single-json",
        "--no-warnings",
        ((prefix .. tostring(count)) .. ":") .. query
    }
    notify(((("Searching " .. prefix) .. " for \"") .. query) .. "\"…")
    vim.system(
        command,
        {text = true},
        function(result)
            vim.schedule(function()
                if result.code ~= 0 then
                    local stderr = trim(result.stderr or "")
                    local first = splitLines(stderr)[1]
                    callback(
                        {},
                        first == nil and ((prefix .. " search failed (exit ") .. tostring(result.code)) .. ")" or first
                    )
                    return
                end
                local decoded = decodeJson(result.stdout or "")
                if decoded == nil then
                    callback({}, "yt-dlp returned output that is not JSON.")
                    return
                end
                local payload = asRecord(decoded)
                local tracks = #asArray(payload.entries) > 0 and readEntries(payload) or readEntries({entries = {payload}})
                if #tracks == 0 then
                    fail(((("No " .. prefix) .. " results for \"") .. query) .. "\".")
                end
                callback(tracks)
            end)
        end
    )
end
--- Extract audio to the configured download directory.
function ____exports.download(url, callback)
    if not ____exports.available() then
        fail(getOptions().yt_dlp .. " is required for downloads.")
        return
    end
    if findPattern(url, "^https?://") == nil then
        fail("Download expects an http(s) URL.")
        return
    end
    local options = getOptions()
    vim.fn.mkdir(options.download_dir, "p")
    local command = {
        options.yt_dlp,
        "--extract-audio",
        "--audio-format",
        "best",
        "--no-playlist",
        "--output",
        "%(title)s.%(ext)s",
        "--paths",
        options.download_dir,
        url
    }
    notify(("Downloading to " .. options.download_dir) .. "…")
    vim.system(
        command,
        {text = true},
        function(result)
            vim.schedule(function()
                if result.code == 0 then
                    notify("Download complete: " .. options.download_dir)
                    if callback ~= nil then
                        callback(true, options.download_dir)
                    end
                    return
                end
                local message = splitLines(trim(result.stderr or ""))[1] or ("Download failed (exit " .. tostring(result.code)) .. ")"
                fail(message)
                if callback ~= nil then
                    callback(false, message)
                end
            end)
        end
    )
end
return ____exports
