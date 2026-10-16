-- Lua Library inline imports
local function __TS__ArraySome(self, callbackfn, thisArg)
    for i = 1, #self do
        if callbackfn(thisArg, self[i], i - 1, self) then
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

local function __TS__ArraySlice(self, first, last)
    local len = #self
    first = first or 0
    if first < 0 then
        first = len + first
        if first < 0 then
            first = 0
        end
    else
        if first > len then
            first = len
        end
    end
    last = last or len
    if last < 0 then
        last = len + last
        if last < 0 then
            last = 0
        end
    else
        if last > len then
            last = len
        end
    end
    local out = {}
    first = first + 1
    last = last + 1
    local n = 1
    while first < last do
        out[n] = self[first]
        first = first + 1
        n = n + 1
    end
    return out
end

local function __TS__CountVarargs(...)
    return select("#", ...)
end

local function __TS__SparseArrayNew(...)
    local sparseArray = {...}
    sparseArray.sparseLength = __TS__CountVarargs(...)
    return sparseArray
end

local function __TS__SparseArrayPush(sparseArray, ...)
    local args = {...}
    local argsLen = __TS__CountVarargs(...)
    local listLen = sparseArray.sparseLength
    for i = 1, argsLen do
        sparseArray[listLen + i] = args[i]
    end
    sparseArray.sparseLength = listLen + argsLen
end

local function __TS__SparseArraySpread(sparseArray)
    local _unpack = unpack or table.unpack
    return _unpack(sparseArray, 1, sparseArray.sparseLength)
end
-- End of Lua Library inline imports
local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local jiosaavn = require("player.providers.jiosaavn")
local lrclib = require("player.providers.lrclib")
local lrcred = require("player.providers.lrcred")
local ____util = require("player.util")
local lower = ____util.lower
local similarity = ____util.similarity
local trim = ____util.trim
local upper = ____util.upper
local function attempt(steps, index, errors, finish)
    if index >= #steps then
        finish(errors)
        return
    end
    steps[index + 1](function(succeeded, ____error)
        if succeeded then
            return
        end
        if ____error ~= "" then
            errors[#errors + 1] = ____error
        end
        attempt(steps, index + 1, errors, finish)
    end)
end
local function setFromTtml(document, isrc, fallback)
    return {
        lines = document.lines,
        source = document.timing == "word" and "lrc.red · TTML word sync" or "lrc.red · TTML",
        provider = "lrc.red",
        title = fallback.title == "" and "" or fallback.title,
        artist = fallback.artist,
        album = fallback.album,
        isrc = isrc,
        sync = document.timing,
        songwriters = document.songwriters
    }
end
local function setFromRecord(record)
    local resolved = lrclib.linesFrom(record)
    local sync = __TS__ArraySome(
        resolved.lines,
        function(____, line) return line.start > 0 end
    ) and "line" or "none"
    return {
        lines = resolved.lines,
        source = resolved.source,
        provider = "LRCLIB",
        title = record.trackName,
        artist = record.artistName,
        album = record.albumName,
        sync = sync,
        songwriters = {}
    }
end
--- Search every enabled lyric catalogue and merge the candidates.
function ____exports.search(query, callback)
    local term = trim(query)
    if term == "" then
        callback({}, {"Enter a song title, artist, or lyric phrase."})
        return
    end
    local sources = getOptions().lyric.sources
    local candidates = {}
    local errors = {}
    local pending = #sources
    local function finish()
        pending = pending - 1
        if pending > 0 then
            return
        end
        __TS__ArraySort(
            candidates,
            function(____, a, b)
                local function providerRank(c)
                    return c.provider == "lrc.red" and 0 or (c.provider == "LRCLIB" and 1 or 2)
                end
                local byProvider = providerRank(a) - providerRank(b)
                if byProvider ~= 0 then
                    return byProvider
                end
                local left = similarity(term, (a.title .. " ") .. a.artist)
                local right = similarity(term, (b.title .. " ") .. b.artist)
                if left ~= right then
                    return right - left
                end
                return a.title < b.title and -1 or 1
            end
        )
        callback(candidates, errors)
    end
    for ____, name in ipairs(sources) do
        local source = lower(trim(name))
        if source == "lrc.red" or source == "lrcred" then
            lrcred.search(
                term,
                function(hits, ____error)
                    if ____error ~= nil then
                        errors[#errors + 1] = "lrc.red: " .. ____error
                    end
                    for ____, candidate in ipairs(lrcred.toCandidates(hits)) do
                        candidates[#candidates + 1] = candidate
                    end
                    finish()
                end
            )
        elseif source == "lrclib" then
            lrclib.search(
                term,
                function(found, ____error)
                    if ____error ~= nil then
                        errors[#errors + 1] = "LRCLIB: " .. ____error
                    end
                    for ____, candidate in ipairs(found) do
                        candidates[#candidates + 1] = candidate
                    end
                    finish()
                end
            )
        elseif source == "jiosaavn" then
            jiosaavn.search(
                term,
                function(songs, ____error)
                    if ____error ~= nil then
                        errors[#errors + 1] = "JioSaavn: " .. ____error
                    end
                    for ____, candidate in ipairs(jiosaavn.toCandidates(songs)) do
                        candidates[#candidates + 1] = candidate
                    end
                    finish()
                end
            )
        else
            errors[#errors + 1] = ("Unknown lyric source \"" .. name) .. "\"."
            finish()
        end
    end
end
--- Fetch the lyric text for one candidate.
function ____exports.fetch(candidate, callback)
    local steps = {}
    if candidate.provider == "lrc.red" or candidate.isrc ~= nil then
        local isrc = candidate.isrc or candidate.id
        steps[#steps + 1] = function(done)
            lrcred.fetchTtml(
                isrc,
                function(document, ____error)
                    if document == nil then
                        done(false, ____error or "lrc.red had no TTML for that ISRC.")
                        return
                    end
                    callback(setFromTtml(
                        document,
                        upper(trim(isrc)),
                        {title = candidate.title, artist = candidate.artist, album = candidate.album}
                    ))
                    done(true, "")
                end
            )
        end
    end
    if candidate.provider == "LRCLIB" then
        steps[#steps + 1] = function(done)
            local id = tonumber(candidate.id)
            if id == nil then
                done(false, "That LRCLIB candidate has no numeric id.")
                return
            end
            lrclib.getById(
                id,
                function(record, ____error)
                    if record == nil then
                        done(false, ____error or "LRCLIB had no record for that id.")
                        return
                    end
                    callback(setFromRecord(record))
                    done(true, "")
                end
            )
        end
    end
    steps[#steps + 1] = function(done)
        lrclib.getBySignature(
            candidate.title,
            candidate.artist,
            candidate.album,
            candidate.duration,
            function(record, ____error)
                if record == nil then
                    done(false, ____error or "No LRCLIB match for that title/artist.")
                    return
                end
                callback(setFromRecord(record))
                done(true, "")
            end
        )
    end
    steps[#steps + 1] = function(done)
        lrcred.search(
            (candidate.title .. " ") .. candidate.artist,
            function(hits, ____error)
                local best = hits[1]
                if best == nil then
                    done(false, ____error or "No lrc.red match for that title/artist.")
                    return
                end
                lrcred.fetchTtml(
                    best.isrc,
                    function(document, ttmlError)
                        if document == nil then
                            done(false, ttmlError or "lrc.red had no TTML for the closest match.")
                            return
                        end
                        callback(setFromTtml(document, best.isrc, {title = best.title, artist = best.artist, album = best.album}))
                        done(true, "")
                    end
                )
            end
        )
    end
    attempt(
        steps,
        0,
        {},
        function(errors) return callback(nil, #errors > 0 and errors[1] or "No lyrics could be resolved.") end
    )
end
--- Fetch word-synced TTML straight from an ISRC.
function ____exports.fetchIsrc(isrc, callback)
    local code = upper(trim(isrc))
    lrcred.metadata(
        code,
        function(meta)
            lrcred.fetchTtml(
                code,
                function(document, ____error)
                    if document == nil then
                        callback(nil, ____error)
                        return
                    end
                    local set = setFromTtml(document, code, {title = meta and meta.title or "", artist = meta and meta.artist or "", album = meta and meta.album or ""})
                    if set.title == "" then
                        set.title = "ISRC " .. code
                    end
                    if (meta and meta.songwriters) ~= nil then
                        set.songwriters = meta.songwriters
                    end
                    callback(set)
                end
            )
        end
    )
end
--- Find lyrics for whatever mpv is playing right now.
function ____exports.resolveTrack(info, callback)
    local steps = {}
    local isrc = upper(trim(info.isrc))
    if isrc ~= "" then
        steps[#steps + 1] = function(done)
            lrcred.fetchTtml(
                isrc,
                function(document, ____error)
                    if document == nil then
                        done(false, ____error or ("lrc.red has no TTML for " .. isrc) .. ".")
                        return
                    end
                    callback(setFromTtml(document, isrc, {title = info.title, artist = info.artist, album = info.album}))
                    done(true, "")
                end
            )
        end
    end
    if trim(info.title) ~= "" or trim(info.artist) ~= "" then
        steps[#steps + 1] = function(done)
            lrcred.match(
                info.title,
                info.artist,
                info.album,
                info.duration,
                function(hits, ____error)
                    if ____error ~= nil and #hits == 0 then
                        done(false, ____error)
                        return
                    end
                    local wanted = info.duration > 0 and info.duration or nil
                    local ranked = __TS__ArraySlice(
                        __TS__ArrayFilter(
                            hits,
                            function(____, hit) return wanted == nil or hit.duration == nil or math.abs(hit.duration - wanted) <= 6 end
                        ),
                        0,
                        3
                    )
                    if #ranked == 0 then
                        done(false, "lrc.red matched nothing close to this recording.")
                        return
                    end
                    local best = ranked[1]
                    lrcred.fetchTtml(
                        best.isrc,
                        function(document, ttmlError)
                            if document == nil then
                                done(false, ttmlError or "lrc.red had no TTML for the closest match.")
                                return
                            end
                            callback(setFromTtml(document, best.isrc, {title = best.title, artist = best.artist, album = best.album}))
                            done(true, "")
                        end
                    )
                end
            )
        end
    end
    if trim(info.title) ~= "" and trim(info.artist) ~= "" then
        steps[#steps + 1] = function(done)
            lrclib.getBySignature(
                info.title,
                info.artist,
                info.album,
                info.duration,
                function(record, ____error)
                    if record == nil then
                        done(false, ____error or "LRCLIB has no record for this track.")
                        return
                    end
                    callback(setFromRecord(record))
                    done(true, "")
                end
            )
        end
    end
    attempt(
        steps,
        0,
        {},
        function(errors) return callback(nil, #errors > 0 and errors[1] or "Not enough metadata to look up lyrics.") end
    )
end
--- Plain-text LRC export, handy for saving next to the audio file.
function ____exports.toLrc(set)
    local header = {}
    if set.title ~= "" then
        header[#header + 1] = ("[ti:" .. set.title) .. "]"
    end
    if set.artist ~= "" then
        header[#header + 1] = ("[ar:" .. set.artist) .. "]"
    end
    if set.album ~= "" then
        header[#header + 1] = ("[al:" .. set.album) .. "]"
    end
    header[#header + 1] = ("[by:player.nvim via " .. set.provider) .. "]"
    local ____array_8 = __TS__SparseArrayNew(unpack(header))
    __TS__SparseArrayPush(____array_8, "")
    local lines = {__TS__SparseArraySpread(____array_8)}
    for ____, line in ipairs(set.lines) do
        local minutes = math.floor(line.start / 60)
        local seconds = line.start - minutes * 60
        lines[#lines + 1] = (("[" .. string.format("%02d:%05.2f", minutes, seconds)) .. "]") .. line.text
    end
    return table.concat(lines, "\n")
end
function ____exports.describeSet(set)
    local words = #__TS__ArrayFilter(
        set.lines,
        function(____, line) return line.words ~= nil end
    )
    local detail = set.sync == "word" and tostring(words) .. " word-timed line(s)" or tostring(#set.lines) .. " line(s)"
    return (set.source .. " · ") .. detail
end
return ____exports
