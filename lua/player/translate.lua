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
local postJson = ____http.postJson
local ____util = require("player.util")
local replace = ____util.replace
local splitLines = ____util.splitLines
local trim = ____util.trim
local function endpoint()
    return replace(
        trim(getOptions().translator.url),
        "/+$",
        ""
    )
end
local function bodyFor(text, target)
    local translator = getOptions().translator
    local body = {q = text, source = translator.source == "" and "auto" or translator.source, target = target, format = "text"}
    if translator.api_key ~= "" then
        body.api_key = translator.api_key
    end
    return body
end
local function translateOne(text, target, callback)
    local url = endpoint() .. "/translate"
    postJson(
        url,
        bodyFor(text, target),
        {timeout = 60},
        function(payload, ____error)
            if payload == nil then
                callback(nil, ____error)
                return
            end
            local record = payload
            local translated = record.translatedText
            if type(translated) ~= "string" then
                callback(nil, "The translator response did not contain translatedText.")
                return
            end
            callback(translated)
        end
    )
end
local function translateEach(texts, target, index, out, callback)
    if index >= #texts then
        callback(out)
        return
    end
    translateOne(
        texts[index + 1],
        target,
        function(value, ____error)
            if value == nil then
                callback(nil, ____error)
                return
            end
            out[#out + 1] = trim(value)
            translateEach(
                texts,
                target,
                index + 1,
                out,
                callback
            )
        end
    )
end
--- Translate every line, keeping the 1:1 mapping with the original lines.
function ____exports.translateLines(lines, target, callback)
    local language = trim(target)
    if language == "" then
        callback(nil, "Enter a target language code (en, vi, ja, hi, ...).")
        return
    end
    if endpoint() == "" then
        callback(nil, "translator.url is empty, so there is nowhere to send the lyrics.")
        return
    end
    local texts = __TS__ArrayMap(
        lines,
        function(____, line) return line.text end
    )
    translateOne(
        table.concat(texts, "\n"),
        language,
        function(value, ____error)
            if value == nil then
                callback(nil, ____error)
                return
            end
            local translated = splitLines(value)
            if #translated == #texts then
                callback(__TS__ArrayMap(
                    translated,
                    function(____, line) return trim(line) end
                ))
                return
            end
            translateEach(
                texts,
                language,
                0,
                {},
                function(each, eachError)
                    if each == nil then
                        callback(nil, eachError)
                    else
                        callback(each)
                    end
                end
            )
        end
    )
end
return ____exports
