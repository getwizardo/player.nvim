--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____lua_2Dutil = require("player.lua-util")
local matchCapture = ____lua_2Dutil.matchCapture
local push = ____lua_2Dutil.push
local split = ____lua_2Dutil.split
local function sortByStart(rows)
    do
        local index = 1
        while index < #rows do
            local current = rows[index + 1]
            local position = index
            while position > 0 and rows[position].start > current.start do
                local swap = rows[position]
                rows[position] = current
                rows[position + 1] = swap
                position = position - 1
            end
            index = index + 1
        end
    end
end
local function decodeXml(text)
    local out = string.gsub(
        text,
        "&#x([%da-fA-F]+);",
        function(hex)
            return vim.fn.nr2char(tonumber(hex, 16))
        end
    )
    out = string.gsub(
        out,
        "&#(%d+);",
        function(decimal)
            return vim.fn.nr2char(tonumber(decimal))
        end
    )
    out = string.gsub(out, "&lt;", "<")
    out = string.gsub(out, "&gt;", ">")
    out = string.gsub(out, "&quot;", "\"")
    out = string.gsub(out, "&apos;", "'")
    out = string.gsub(out, "&amp;", "&")
    return out
end
local function attribute(attributes, name)
    local quoted = matchCapture(attributes, name .. "%s*=%s*\"([^\"]*)\"")
    if quoted ~= nil then
        return quoted
    end
    return matchCapture(attributes, name .. "%s*=%s*'([^']*)'")
end
local function clean(text)
    local out = string.gsub(text, "<br%s*/?>", " ")
    out = string.gsub(out, "<[^>]+>", " ")
    out = decodeXml(out)
    out = string.gsub(out, "%s+", " ")
    return string.gsub(out, "^%s*(.-)%s*$", "%1")
end
--- Convert a TTML time expression into seconds.
function ____exports.toSeconds(value)
    if value == nil then
        return 0
    end
    local frames = matchCapture(value, "^(%d+):%d+:%d+:%d+%.?%d*$")
    if frames ~= nil then
        local hours = tonumber(matchCapture(value, "^(%d+)")) or 0
        local minutes = tonumber(matchCapture(value, "^%d+:(%d+)")) or 0
        local seconds = tonumber(matchCapture(value, "^%d+:%d+:(%d+)")) or 0
        local framesCount = tonumber(matchCapture(value, "^%d+:%d+:%d+:(%d+%.?%d*)")) or 0
        return hours * 3600 + minutes * 60 + seconds + framesCount / 30
    end
    local clock = matchCapture(value, "^%d+:%d+:%d+%.?%d*$")
    if clock ~= nil then
        local hours = tonumber(matchCapture(value, "^(%d+)")) or 0
        local minutes = tonumber(matchCapture(value, "^%d+:(%d+)")) or 0
        local seconds = tonumber(matchCapture(value, "^%d+:%d+:(%d+%.?%d*)")) or 0
        return hours * 3600 + minutes * 60 + seconds
    end
    local seconds = matchCapture(value, "^(%d+%.?%d*)s$")
    if seconds ~= nil then
        return tonumber(seconds) or 0
    end
    local milliseconds = matchCapture(value, "^(%d+%.?%d*)ms$")
    if milliseconds ~= nil then
        return (tonumber(milliseconds) or 0) / 1000
    end
    local ticks = matchCapture(value, "^(%d+%.?%d*)t$")
    if ticks ~= nil then
        return tonumber(ticks) or 0
    end
    return tonumber(value) or 0
end
local function collect(xml, pattern, out)
    string.gsub(
        xml,
        pattern,
        function(...)
            local args = {...}
            out[#out + 1] = {attributes = #args > 1 and args[2] or "", body = #args > 2 and args[3] or ""}
            return ""
        end
    )
end
local function blocks(xml, name)
    local out = {}
    collect(xml, ((("(<" .. name) .. "([^>]*)>(.-)</") .. name) .. "%s*>)", out)
    collect(xml, ((("(<[%w_.-]+:" .. name) .. "([^>]*)>(.-)</[%w_.-]+:") .. name) .. "%s*>)", out)
    return out
end
--- Parse a TTML document into timed lyric lines.
function ____exports.parseTtml(xml)
    local rows = {}
    local paragraphs = blocks(xml, "p")
    do
        local index = 0
        while index < #paragraphs do
            local paragraph = paragraphs[index + 1]
            local start = ____exports.toSeconds(attribute(paragraph.attributes, "begin"))
            local finish = ____exports.toSeconds(attribute(paragraph.attributes, "end"))
            local words = {}
            local spans = blocks(paragraph.body, "span")
            do
                local spanIndex = 0
                while spanIndex < #spans do
                    local span = spans[spanIndex + 1]
                    local text = clean(span.body)
                    local begin = attribute(span.attributes, "begin")
                    local ____end = attribute(span.attributes, "end")
                    if text ~= "" and (begin ~= nil or ____end ~= nil) then
                        local rawStart = ____exports.toSeconds(begin)
                        local rawFinish = ____exports.toSeconds(____end)
                        local word = {start = rawStart > 0 and rawStart < start and start + rawStart or rawStart, finish = rawFinish > 0 and rawFinish < start and start + rawFinish or rawFinish, text = text}
                        words[#words + 1] = word
                    end
                    spanIndex = spanIndex + 1
                end
            end
            local text = clean(paragraph.body)
            if text ~= "" then
                local row = {start = start, finish = finish, text = text}
                if #words > 0 then
                    do
                        local wordIndex = 1
                        while wordIndex < #words do
                            local previous = words[wordIndex + 1]
                            local current = words[wordIndex + 1 + 1]
                            if previous.start > current.start then
                                local swap = previous.start
                                previous.start = current.start
                                current.start = swap
                            end
                            wordIndex = wordIndex + 1
                        end
                    end
                    do
                        local wordIndex = 0
                        while wordIndex < #words do
                            local word = words[wordIndex + 1]
                            if word.finish == 0 then
                                local next = words[wordIndex + 1 + 1]
                                word.finish = next ~= nil and next.start or finish
                            end
                            wordIndex = wordIndex + 1
                        end
                    end
                    row.words = words
                end
                rows[#rows + 1] = row
            end
            index = index + 1
        end
    end
    sortByStart(rows)
    return rows
end
--- Parse a synced LRC document into timed lyric lines.
function ____exports.parseLrc(lrc)
    local rows = {}
    local lines = split(lrc, "\n")
    do
        local lineIndex = 0
        while lineIndex < #lines do
            do
                local __continue38
                repeat
                    local rest = string.gsub(lines[lineIndex + 1], "\r", "")
                    local stamps = {}
                    while true do
                        local stamp = matchCapture(rest, "^%[(.-)%]")
                        if stamp == nil then
                            break
                        end
                        local minutes = tonumber(matchCapture(stamp, "^(%d+):"))
                        local seconds = tonumber(matchCapture(stamp, "^%d+:(%d+)"))
                        local fractionText = matchCapture(stamp, "[%.:](%d+)$")
                        local fraction = 0
                        if fractionText ~= nil then
                            local divisor = #fractionText == 1 and 10 or (#fractionText == 2 and 100 or 1000)
                            fraction = (tonumber(fractionText) or 0) / divisor
                        end
                        if minutes == nil or seconds == nil then
                            break
                        end
                        stamps[#stamps + 1] = minutes * 60 + seconds + fraction
                        rest = string.sub(rest, #stamp + 3)
                    end
                    if #stamps == 0 then
                        __continue38 = true
                        break
                    end
                    local text = string.gsub(rest, "^%s*(.-)%s*$", "%1")
                    if text == "" then
                        __continue38 = true
                        break
                    end
                    do
                        local index = 0
                        while index < #stamps do
                            push(rows, {start = stamps[index + 1], finish = 0, text = text})
                            index = index + 1
                        end
                    end
                    __continue38 = true
                until true
                if not __continue38 then
                    break
                end
            end
            lineIndex = lineIndex + 1
        end
    end
    sortByStart(rows)
    return rows
end
return ____exports
