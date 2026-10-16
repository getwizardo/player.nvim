--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
--- Run a function and capture its result or its error message.
function ____exports.attempt(fn)
    local value = nil
    local message = nil
    local ok = xpcall(
        function()
            value = fn()
        end,
        function(____error)
            message = type(____error) == "string" and ____error or tostring(____error)
            return false
        end
    )
    if ok == true then
        return {ok = true, value = value}
    end
    return {ok = false, error = message}
end
--- Split a string on a plain (non pattern) separator.
function ____exports.split(text, separator)
    local parts = {}
    if separator == "" then
        parts[1] = text
        return parts
    end
    local from = 1
    while true do
        local at = string.find(text, separator, from, true)
        if at == nil then
            break
        end
        parts[#parts + 1] = string.sub(text, from, at - 1)
        from = at + #separator
    end
    parts[#parts + 1] = string.sub(text, from)
    return parts
end
--- Remove leading and trailing whitespace.
function ____exports.trim(text)
    return string.gsub(text, "^%s*(.-)%s*$", "%1")
end
--- Return the first capture of a Lua pattern.
-- 
-- `string.match` returns several values, which cannot be modelled without the
-- TypeScript-to-Lua runtime, so the capture is collected with `string.gsub`
-- instead.
function ____exports.matchCapture(text, pattern)
    local captured = nil
    string.gsub(
        text,
        pattern,
        function(...)
            local args = {...}
            if captured == nil then
                captured = #args > 1 and args[2] or args[1]
            end
            return ""
        end
    )
    return captured
end
--- True when `text` starts with `prefix`.
function ____exports.startsWith(text, prefix)
    if prefix == "" then
        return true
    end
    return string.sub(text, 1, #prefix) == prefix
end
--- True when `text` ends with `suffix`.
function ____exports.endsWith(text, suffix)
    if suffix == "" then
        return true
    end
    if #suffix > #text then
        return false
    end
    return string.sub(text, #text - #suffix + 1) == suffix
end
--- True when `needle` occurs inside `haystack`.
function ____exports.contains(haystack, needle)
    if needle == "" then
        return true
    end
    return string.find(haystack, needle, 1, true) ~= nil
end
--- Parse a number, returning undefined when the value is not numeric.
function ____exports.toNumber(text)
    local value = tonumber(text)
    if value == nil then
        return nil
    end
    return value
end
--- Copy an array.
function ____exports.copy(list)
    local out = {}
    do
        local index = 0
        while index < #list do
            out[index + 1] = list[index + 1]
            index = index + 1
        end
    end
    return out
end
--- Append a value to an array.
function ____exports.push(list, value)
    list[#list + 1] = value
end
--- Remove the entry at `index` from an array.
function ____exports.removeAt(list, index)
    table.remove(list, index + 1)
end
--- Remove every entry of an array.
function ____exports.clear(list)
    while #list > 0 do
        table.remove(list)
    end
end
--- Index of `value` inside `list`, or -1 when it is missing.
function ____exports.indexOf(list, value)
    do
        local index = 0
        while index < #list do
            if list[index + 1] == value then
                return index
            end
            index = index + 1
        end
    end
    return -1
end
--- Concatenate the string representation of every entry.
function ____exports.join(list, separator)
    return table.concat(list, separator)
end
return ____exports
