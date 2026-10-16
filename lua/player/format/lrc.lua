-- Lua Library inline imports
local function __TS__ArrayMap(self, callbackfn, thisArg)
    local result = {}
    for i = 1, #self do
        result[i] = callbackfn(thisArg, self[i], i - 1, self)
    end
    return result
end

local function __TS__ObjectAssign(target, ...)
    local sources = {...}
    for i = 1, #sources do
        local source = sources[i]
        if type(source) == "table" then
            for key in pairs(source) do
                target[key] = source[key]
            end
        end
    end
    return target
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

local function __TS__ArrayForEach(self, callbackFn, thisArg)
    for i = 1, #self do
        callbackFn(thisArg, self[i], i - 1, self)
    end
end
-- End of Lua Library inline imports
local ____exports = {}
local ____util = require("player.util")
local lower = ____util.lower
local match = ____util.match
local matchList = ____util.matchList
local matchTriples = ____util.matchTriples
local replace = ____util.replace
local trim = ____util.trim
local function stampSeconds(minutes, seconds)
    return (tonumber(minutes) or 0) * 60 + (tonumber(seconds) or 0)
end
--- Parse enhanced word timestamps out of an LRC line body.
local function readWords(body)
    local words = {}
    for ____, ____value in ipairs(matchTriples(body, "<(%d+):(%d+%.?%d*)>([^<]*)")) do
        local minutes = ____value[1]
        local seconds = ____value[2]
        local text = ____value[3]
        do
            local __continue4
            repeat
                local value = trim(text)
                if value == "" then
                    __continue4 = true
                    break
                end
                words[#words + 1] = {
                    start = stampSeconds(minutes, seconds),
                    finish = 0,
                    text = value
                }
                __continue4 = true
            until true
            if not __continue4 then
                break
            end
        end
    end
    return words
end
local function cleanBody(body)
    return trim(replace(
        replace(body, "<[^>]+>", " "),
        "%s+",
        " "
    ))
end
function ____exports.parseLrc(lrc)
    local meta = {title = "", artist = "", album = "", offset = 0}
    local raw = {}
    for ____, source in ipairs(matchList(lrc, "[^\r\n]+")) do
        do
            local __continue9
            repeat
                local line = trim(source)
                if line == "" then
                    __continue9 = true
                    break
                end
                local stamps = {}
                local rest = line
                while true do
                    local parts = match(rest, "^%[(%d+):(%d+%.?%d*)%]%s*(.*)$")
                    if #parts < 3 then
                        break
                    end
                    stamps[#stamps + 1] = stampSeconds(parts[1], parts[2])
                    rest = parts[3]
                end
                local body = rest
                if #stamps == 0 then
                    local tagged = match(line, "^%[([%a#]+):(.*)%]$")
                    if #tagged == 2 then
                        local key = lower(tagged[1])
                        local value = trim(tagged[2])
                        if key == "offset" then
                            meta.offset = tonumber(value) or 0
                        elseif key == "ti" or key == "title" then
                            meta.title = value
                        elseif key == "ar" or key == "artist" then
                            meta.artist = value
                        elseif key == "al" or key == "album" then
                            meta.album = value
                        end
                        __continue9 = true
                        break
                    end
                    if body == "" then
                        __continue9 = true
                        break
                    end
                    raw[#raw + 1] = {
                        start = 0,
                        finish = 0,
                        text = cleanBody(body)
                    }
                    __continue9 = true
                    break
                end
                if body == "" then
                    __continue9 = true
                    break
                end
                local words = readWords(body)
                local text = #words > 0 and table.concat(
                    __TS__ArrayMap(
                        words,
                        function(____, word) return word.text end
                    ),
                    " "
                ) or cleanBody(body)
                for ____, stamp in ipairs(stamps) do
                    local entry = {start = stamp, finish = 0, text = text}
                    if #words > 0 then
                        entry.words = __TS__ArrayMap(
                            words,
                            function(____, word) return __TS__ObjectAssign({}, word) end
                        )
                    end
                    raw[#raw + 1] = entry
                end
                __continue9 = true
            until true
            if not __continue9 then
                break
            end
        end
    end
    local offset = meta.offset / 1000
    for ____, line in ipairs(raw) do
        line.start = math.max(0, line.start + offset)
        if line.words ~= nil then
            for ____, word in ipairs(line.words) do
                word.start = math.max(0, word.start + offset)
            end
        end
    end
    __TS__ArraySort(
        raw,
        function(____, a, b) return a.start - b.start end
    )
    __TS__ArrayForEach(
        raw,
        function(____, line, index)
            if line.finish == 0 and raw[index + 1 + 1] ~= nil then
                line.finish = raw[index + 1 + 1].start
            end
            if line.words ~= nil then
                __TS__ArrayForEach(
                    line.words,
                    function(____, word, position)
                        if word.finish == 0 then
                            local ____word_4 = word
                            local ____opt_2 = line.words
                            local ____opt_0 = ____opt_2 and ____opt_2[position + 1 + 1]
                            ____word_4.finish = ____opt_0 and ____opt_0.start or line.finish
                        end
                    end
                )
            end
        end
    )
    return {lines = raw, meta = meta}
end
return ____exports
