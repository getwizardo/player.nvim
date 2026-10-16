-- Lua Library inline imports
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

local function __TS__ArraySome(self, callbackfn, thisArg)
    for i = 1, #self do
        if callbackfn(thisArg, self[i], i - 1, self) then
            return true
        end
    end
    return false
end
-- End of Lua Library inline imports
local ____exports = {}
local ____xml = require("player.format.xml")
local attr = ____xml.attr
local childrenNamed = ____xml.childrenNamed
local findAll = ____xml.findAll
local findFirst = ____xml.findFirst
local parseXml = ____xml.parseXml
local textOf = ____xml.textOf
local ____util = require("player.util")
local inlineText = ____util.inlineText
local lower = ____util.lower
local match = ____util.match
local plainText = ____util.plainText
local trim = ____util.trim
local EMPTY = {
    lines = {},
    songwriters = {},
    language = "",
    timing = "none",
    duration = 0
}
--- Convert any TTML time expression to seconds.
function ____exports.timing(value, frameRate, tickRate)
    if value == nil then
        return 0
    end
    local text = trim(value)
    if text == "" then
        return 0
    end
    local frames = match(text, "^(%d+):(%d+):(%d+):(%d+%.?%d*)$")
    if #frames == 4 then
        return (tonumber(frames[1]) or 0) * 3600 + (tonumber(frames[2]) or 0) * 60 + (tonumber(frames[3]) or 0) + (tonumber(frames[4]) or 0) / frameRate
    end
    local clock = match(text, "^(%d+):(%d+):(%d+%.?%d*)$")
    if #clock == 3 then
        return (tonumber(clock[1]) or 0) * 3600 + (tonumber(clock[2]) or 0) * 60 + (tonumber(clock[3]) or 0)
    end
    local short = match(text, "^(%d+):(%d+%.?%d*)$")
    if #short == 2 then
        return (tonumber(short[1]) or 0) * 60 + (tonumber(short[2]) or 0)
    end
    local offset = match(text, "^(%d+%.?%d*)(%a*)$")
    if #offset == 2 then
        local amount = tonumber(offset[1]) or 0
        local unit = offset[2]
        if unit == "ms" then
            return amount / 1000
        end
        if unit == "t" then
            return tickRate > 0 and amount / tickRate or amount
        end
        return amount
    end
    return tonumber(text) or 0
end
local function readRates(root)
    local rate = attr(root, "ttp:frameRate")
    local frameRate = 30
    if rate ~= nil then
        local fraction = match(rate, "^(%d+)%s+(%d+)%s+(%d+)$")
        local ____temp_0
        if #fraction == 3 then
            ____temp_0 = tonumber(fraction[2])
        else
            ____temp_0 = nil
        end
        local numerator = ____temp_0
        local ____temp_1
        if #fraction == 3 then
            ____temp_1 = tonumber(fraction[3])
        else
            ____temp_1 = nil
        end
        local denominator = ____temp_1
        local base = tonumber(match(rate, "^(%d+)")[1] or "") or 30
        frameRate = numerator ~= nil and denominator ~= nil and denominator > 0 and base * numerator / denominator or base
    end
    local ticks = tonumber(attr(root, "ttp:tickRate") or "")
    return {frameRate = frameRate > 0 and frameRate or 30, tickRate = ticks ~= nil and ticks > 0 and ticks or frameRate}
end
local function readAgents(root)
    local agents = {}
    for ____, agent in ipairs(findAll(root, "agent")) do
        do
            local __continue14
            repeat
                local id = attr(agent, "xml:id") or attr(agent, "id")
                if id == nil then
                    __continue14 = true
                    break
                end
                local name = findFirst(agent, "name")
                if name == nil then
                    __continue14 = true
                    break
                end
                agents[id] = trim(textOf(name))
                __continue14 = true
            until true
            if not __continue14 then
                break
            end
        end
    end
    return agents
end
local function readTranslations(root)
    local map = {}
    for ____, container in ipairs(findAll(root, "translations")) do
        for ____, translation in ipairs(childrenNamed(container, "translation")) do
            for ____, text in ipairs(childrenNamed(translation, "text")) do
                do
                    local __continue21
                    repeat
                        local target = attr(text, "for")
                        if target == nil then
                            __continue21 = true
                            break
                        end
                        local value = plainText(textOf(text))
                        if value == "" then
                            __continue21 = true
                            break
                        end
                        map[target] = map[target] == nil and value or (map[target] .. " ") .. value
                        __continue21 = true
                    until true
                    if not __continue21 then
                        break
                    end
                end
            end
        end
    end
    return map
end
local function readSongwriters(root)
    local writers = {}
    for ____, container in ipairs(findAll(root, "songwriters")) do
        for ____, writer in ipairs(childrenNamed(container, "songwriter")) do
            local name = trim(textOf(writer))
            if name ~= "" then
                writers[#writers + 1] = name
            end
        end
    end
    return writers
end
local function roleOf(node)
    return lower(attr(node, "role") or "")
end
--- Collect timed spans (including nested background vocals) from a paragraph.
local function readSpans(paragraph, frameRate, tickRate, background)
    local info = {words = {}, background = {}, translation = {}, roman = {}}
    local function push(child)
        for ____, word in ipairs(child.words) do
            local ____info_words_2 = info.words
            ____info_words_2[#____info_words_2 + 1] = word
        end
        for ____, value in ipairs(child.background) do
            local ____info_background_3 = info.background
            ____info_background_3[#____info_background_3 + 1] = value
        end
        for ____, value in ipairs(child.translation) do
            local ____info_translation_4 = info.translation
            ____info_translation_4[#____info_translation_4 + 1] = value
        end
        for ____, value in ipairs(child.roman) do
            local ____info_roman_5 = info.roman
            ____info_roman_5[#____info_roman_5 + 1] = value
        end
    end
    for ____, span in ipairs(childrenNamed(paragraph, "span")) do
        do
            local __continue44
            repeat
                local role = roleOf(span)
                local isBackground = background or role == "x-bg"
                local nested = readSpans(span, frameRate, tickRate, isBackground)
                local begin = attr(span, "begin")
                local ____end = attr(span, "end")
                local text = plainText(textOf(span))
                if role == "x-translation" then
                    if text ~= "" then
                        local ____info_translation_6 = info.translation
                        ____info_translation_6[#____info_translation_6 + 1] = text
                    end
                    push(nested)
                    __continue44 = true
                    break
                end
                if role == "x-roman" then
                    if text ~= "" then
                        local ____info_roman_7 = info.roman
                        ____info_roman_7[#____info_roman_7 + 1] = text
                    end
                    push(nested)
                    __continue44 = true
                    break
                end
                if begin == nil and ____end == nil then
                    push(nested)
                    __continue44 = true
                    break
                end
                local word = {
                    start = ____exports.timing(begin, frameRate, tickRate),
                    finish = ____exports.timing(____end, frameRate, tickRate),
                    text = text
                }
                if isBackground then
                    word.background = true
                end
                if text ~= "" then
                    local ____info_words_8 = info.words
                    ____info_words_8[#____info_words_8 + 1] = word
                    if isBackground then
                        local ____info_background_9 = info.background
                        ____info_background_9[#____info_background_9 + 1] = text
                    end
                end
                push(nested)
                __continue44 = true
            until true
            if not __continue44 then
                break
            end
        end
    end
    return info
end
function ____exports.parseTtml(xml)
    local root = parseXml(xml)
    if root == nil then
        return EMPTY
    end
    local ____readRates_result_10 = readRates(root)
    local frameRate = ____readRates_result_10.frameRate
    local tickRate = ____readRates_result_10.tickRate
    local agents = readAgents(root)
    local translations = readTranslations(root)
    local lines = {}
    local walk
    walk = function(node, part)
        for ____, child in ipairs(node.children) do
            do
                local __continue57
                repeat
                    if child["local"] == "p" then
                        local start = ____exports.timing(
                            attr(child, "begin"),
                            frameRate,
                            tickRate
                        )
                        local finish = ____exports.timing(
                            attr(child, "end"),
                            frameRate,
                            tickRate
                        )
                        local spans = readSpans(child, frameRate, tickRate, false)
                        __TS__ArraySort(
                            spans.words,
                            function(____, a, b) return a.start - b.start end
                        )
                        local text = inlineText(child.inner)
                        if text == "" then
                            __continue57 = true
                            break
                        end
                        local line = {start = start, finish = finish > start and finish or 0, text = text}
                        if #spans.words > 0 then
                            __TS__ArrayForEach(
                                spans.words,
                                function(____, word, index)
                                    if word.finish <= word.start then
                                        local ____word_13 = word
                                        local ____opt_11 = spans.words[index + 1 + 1]
                                        ____word_13.finish = ____opt_11 and ____opt_11.start or line.finish
                                    end
                                end
                            )
                            line.words = spans.words
                        end
                        if #spans.translation > 0 then
                            line.translation = table.concat(spans.translation, " ")
                        end
                        if #spans.background > 0 then
                            line.background = table.concat(spans.background, " ")
                        end
                        local key = attr(child, "lrc:key") or attr(child, "itunes:key")
                        if key ~= nil then
                            local translated = translations[key]
                            if translated ~= nil and line.translation == nil then
                                line.translation = translated
                            end
                        end
                        local singer = attr(child, "ttm:agent") or attr(child, "itunes:agent")
                        if singer ~= nil and agents[singer] ~= nil then
                            line.singer = agents[singer]
                        end
                        line.part = attr(child, "lrc:songPart") or attr(child, "itunes:songPart") or part
                        lines[#lines + 1] = line
                        __continue57 = true
                        break
                    end
                    walk(
                        child,
                        attr(child, "lrc:songPart") or attr(child, "itunes:songPart") or part
                    )
                    __continue57 = true
                until true
                if not __continue57 then
                    break
                end
            end
        end
    end
    local body = findFirst(root, "body") or root
    walk(body, nil)
    __TS__ArraySort(
        lines,
        function(____, a, b) return a.start - b.start end
    )
    local declared = lower(attr(root, "lrc:timing") or attr(root, "itunes:timing") or "")
    local inferred = __TS__ArraySome(
        lines,
        function(____, line) return line.words ~= nil end
    ) and "word" or (#lines > 0 and __TS__ArraySome(
        lines,
        function(____, line) return line.start > 0 end
    ) and "line" or "none")
    local timingMode = declared == "word" and "word" or (declared == "line" and "line" or (declared == "none" and "none" or inferred))
    return {
        lines = lines,
        songwriters = readSongwriters(root),
        language = attr(root, "xml:lang") or attr(root, "lang") or "",
        timing = timingMode,
        duration = ____exports.timing(
            attr(body, "dur"),
            frameRate,
            tickRate
        )
    }
end
return ____exports
