local ____exports = {}
local ____util = require("player.util")
local decodeXmlEntities = ____util.decodeXmlEntities
local indexOf = ____util.indexOf
local match = ____util.match
local matchPairs = ____util.matchPairs
local sub = ____util.sub
local trim = ____util.trim
local function localName(name)
    local parts = match(name, "^[%w_.%-]+:([%w_.%-]+)$")
    return parts[1] or name
end
local function parseAttributes(source)
    local attrs = {}
    for ____, ____value in ipairs(matchPairs(source, "([%w_.:%-]+)%s*=%s*\"([^\"]*)\"")) do
        local key = ____value[1]
        local value = ____value[2]
        attrs[key] = value
    end
    for ____, ____value in ipairs(matchPairs(source, "([%w_.:%-]+)%s*=%s*'([^']*)'")) do
        local key = ____value[1]
        local value = ____value[2]
        if attrs[key] == nil then
            attrs[key] = value
        end
    end
    return attrs
end
local function isBlank(char)
    return char == " " or char == "\t" or char == "\n" or char == "\r"
end
--- Skip whitespace, XML declarations, processing instructions and comments.
local function skipIgnorable(cursor)
    local xml = cursor.xml
    local moved = true
    while moved do
        moved = false
        while cursor.pos <= #xml and isBlank(sub(xml, cursor.pos, cursor.pos)) do
            cursor.pos = cursor.pos + 1
        end
        if sub(xml, cursor.pos, cursor.pos + 1) == "<?" then
            local close = indexOf(xml, "?>", cursor.pos)
            cursor.pos = close == nil and #xml + 1 or close + 2
            moved = true
        elseif sub(xml, cursor.pos, cursor.pos + 3) == "<!--" then
            local close = indexOf(xml, "-->", cursor.pos)
            cursor.pos = close == nil and #xml + 1 or close + 3
            moved = true
        elseif sub(xml, cursor.pos, cursor.pos + 1) == "<!" then
            local close = indexOf(xml, ">", cursor.pos)
            cursor.pos = close == nil and #xml + 1 or close + 1
            moved = true
        end
    end
end
--- Position of `</name`, ignoring look-alikes: `</tt` must not match `</ttm:name`.
-- The character after the tag name has to be a boundary (space, `>`, `/` or end
-- of input) for the tag to count.
local function findCloseTag(xml, name, from)
    local needle = "</" .. name
    local at = indexOf(xml, needle, from)
    while at ~= nil do
        local after = sub(xml, at + #needle, at + #needle)
        if after == "" or isBlank(after) or after == ">" or after == "/" then
            return at
        end
        at = indexOf(xml, needle, at + 1)
    end
    return nil
end
local function parseElement(cursor)
    local xml = cursor.xml
    skipIgnorable(cursor)
    if sub(xml, cursor.pos, cursor.pos) ~= "<" then
        return nil
    end
    local name = match(
        sub(xml, cursor.pos + 1),
        "^([%w_.:%-]+)"
    )[1]
    if name == nil then
        return nil
    end
    local afterName = cursor.pos + 1 + #name
    local openEnd = indexOf(xml, ">", afterName)
    if openEnd == nil then
        return nil
    end
    local rawAttrs = sub(xml, afterName, openEnd - 1)
    local selfClosing = sub(rawAttrs, -1) == "/"
    if selfClosing then
        rawAttrs = sub(rawAttrs, 1, -2)
    end
    local node = {
        name = name,
        ["local"] = localName(name),
        attrs = parseAttributes(rawAttrs),
        children = {},
        text = "",
        inner = ""
    }
    cursor.pos = openEnd + 1
    if selfClosing then
        return node
    end
    local contentStart = cursor.pos
    local openTag = "<" .. name
    local depth = 1
    local search = cursor.pos
    local contentEnd
    while true do
        do
            local __continue25
            repeat
                local nextOpen = indexOf(xml, openTag, search)
                local nextClose = findCloseTag(xml, name, search)
                if nextClose == nil then
                    break
                end
                if nextOpen ~= nil and nextOpen < nextClose then
                    local after = sub(xml, nextOpen + #openTag, nextOpen + #openTag)
                    if isBlank(after) or after == "/" or after == ">" then
                        depth = depth + 1
                    end
                    search = nextOpen + 1
                    __continue25 = true
                    break
                end
                depth = depth - 1
                if depth == 0 then
                    contentEnd = nextClose - 1
                    local tagEnd = indexOf(xml, ">", nextClose)
                    cursor.pos = tagEnd == nil and #xml + 1 or tagEnd + 1
                    break
                end
                search = nextClose + 1
                __continue25 = true
            until true
            if not __continue25 then
                break
            end
        end
    end
    if contentEnd == nil then
        node.inner = sub(xml, contentStart)
        cursor.pos = #xml + 1
        return node
    end
    node.inner = sub(xml, contentStart, contentEnd)
    local inner = {xml = xml, pos = contentStart}
    while inner.pos <= contentEnd do
        do
            local __continue31
            repeat
                skipIgnorable(inner)
                if inner.pos > contentEnd then
                    break
                end
                if sub(xml, inner.pos, inner.pos) == "<" then
                    local child = parseElement(inner)
                    if child == nil then
                        break
                    end
                    local ____node_children_0 = node.children
                    ____node_children_0[#____node_children_0 + 1] = child
                    __continue31 = true
                    break
                end
                local nextTag = indexOf(xml, "<", inner.pos)
                local stop = (nextTag == nil or nextTag > contentEnd + 1) and contentEnd + 1 or nextTag
                node.text = node.text .. decodeXmlEntities(sub(xml, inner.pos, stop - 1))
                inner.pos = stop
                __continue31 = true
            until true
            if not __continue31 then
                break
            end
        end
    end
    return node
end
--- Parse an XML document, returning its root element or `undefined`.
function ____exports.parseXml(xml)
    return parseElement({xml = xml, pos = 1})
end
--- Attribute lookup that ignores namespace prefixes (`begin`, `lrc:key`, ...).
function ____exports.attr(node, name)
    local direct = node.attrs[name]
    if direct ~= nil then
        return direct
    end
    local bare = localName(name)
    for key in pairs(node.attrs) do
        if localName(key) == bare then
            return node.attrs[key]
        end
    end
    return nil
end
--- Depth-first search for the first descendant with the given local name.
function ____exports.findFirst(node, ____local)
    for ____, child in ipairs(node.children) do
        if child["local"] == ____local then
            return child
        end
    end
    for ____, child in ipairs(node.children) do
        local found = ____exports.findFirst(child, ____local)
        if found ~= nil then
            return found
        end
    end
    return nil
end
--- Every descendant (in document order) with the given local name.
function ____exports.findAll(node, ____local)
    local found = {}
    local walk
    walk = function(current)
        for ____, child in ipairs(current.children) do
            if child["local"] == ____local then
                found[#found + 1] = child
            end
            walk(child)
        end
    end
    walk(node)
    return found
end
--- Direct children with the given local name.
function ____exports.childrenNamed(node, ____local)
    local found = {}
    for ____, child in ipairs(node.children) do
        if child["local"] == ____local then
            found[#found + 1] = child
        end
    end
    return found
end
--- Decoded text of an element including all nested text.
function ____exports.textOf(node)
    local text = node.text
    for ____, child in ipairs(node.children) do
        text = text .. ____exports.textOf(child)
    end
    return trim(text)
end
return ____exports
