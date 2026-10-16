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
-- End of Lua Library inline imports
local ____exports = {}
function ____exports.clamp(value, min, max)
    return math.min(
        max,
        math.max(min, value)
    )
end
--- `string.gsub` returning just the replaced text.
-- 
-- Assigning a Lua multi-return to an array-typed value makes tstl emit
-- `local x = {f(...)}`, which keeps every return value; destructuring it
-- instead would emit `unpack(f(...))`, which only works on tables.
function ____exports.replace(value, pattern, repl)
    local result = {string.gsub(value, pattern, repl)}
    return result[1]
end
--- Captures of the first match, or an empty array when nothing matched.
-- A pattern without captures returns the whole match as its single element.
function ____exports.match(value, pattern, init)
    return {string.match(value, pattern, init)}
end
--- Every match of a single-capture (or capture-less) pattern, in order.
function ____exports.matchList(value, pattern)
    local out = {}
    local iter = string.gmatch(value, pattern)
    for found in iter do
        out[#out + 1] = found
    end
    return out
end
--- Every match of a two-capture pattern.
function ____exports.matchPairs(value, pattern)
    local out = {}
    local iter = string.gmatch(value, pattern)
    for first, second in iter do
        out[#out + 1] = {first, second}
    end
    return out
end
--- Every match of a three-capture pattern.
function ____exports.matchTriples(value, pattern)
    local out = {}
    local iter = string.gmatch(value, pattern)
    for first, second, third in iter do
        out[#out + 1] = {first, second, third}
    end
    return out
end
--- Byte index of the first *literal* occurrence of `needle` (1-based, no patterns).
function ____exports.indexOf(value, needle, init)
    if init == nil then
        init = 1
    end
    local found = {string.find(value, needle, init, true)}
    return found[1]
end
--- 1-based index of a pattern match, or `undefined`.
function ____exports.findPattern(value, pattern, init)
    if init == nil then
        init = 1
    end
    local found = {string.find(value, pattern, init)}
    return found[1]
end
--- Lua's 1-based, inclusive substring.
function ____exports.sub(value, start, ____end)
    return string.sub(value, start, ____end)
end
function ____exports.byteAt(value, position)
    if position == nil then
        position = 1
    end
    return string.byte(value, position)
end
function ____exports.lower(value)
    return string.lower(value)
end
function ____exports.upper(value)
    return string.upper(value)
end
function ____exports.rep(value, count)
    return string.rep(value, count)
end
function ____exports.trim(value)
    return ____exports.replace(
        ____exports.replace(value, "^%s+", ""),
        "%s+$",
        ""
    )
end
--- Escape Lua pattern magic characters so `value` matches literally.
function ____exports.escapePattern(value)
    return ____exports.replace(value, "([%(%)%.%%%+%-%*%?%[%]%^%$])", "%%%1")
end
function ____exports.notify(message, level)
    vim.schedule(function() return vim.notify(message, level or vim.log.levels.INFO, {title = "player.nvim"}) end)
end
function ____exports.warn(message)
    ____exports.notify(message, vim.log.levels.WARN)
end
function ____exports.fail(message)
    ____exports.notify(message, vim.log.levels.ERROR)
end
--- Notify at most once per key per 15s so polled code cannot spam.
local lastNotice = {}
function ____exports.notifyOnce(key, message, level)
    local now = vim.uv.now()
    local previous = lastNotice[key]
    if previous ~= nil and now - previous < 15000 then
        return
    end
    lastNotice[key] = now
    ____exports.notify(message, level)
end
--- Clamp to the 0..1 range, which is what ratios want.
function ____exports.clamp01(value)
    if value ~= value then
        return 0
    end
    return ____exports.clamp(value, 0, 1)
end
--- Pad `value` on the right so columns line up.
function ____exports.padRight(value, width)
    return value .. ____exports.rep(
        " ",
        math.max(0, width - #value)
    )
end
--- `m:ss` below an hour, `h:mm:ss` beyond it.
function ____exports.formatTime(seconds)
    if seconds == nil or seconds < 0 then
        return "--:--"
    end
    local total = math.floor(seconds)
    local hours = math.floor(total / 3600)
    local minutes = math.floor(total % 3600 / 60)
    local rest = total % 60
    if hours > 0 then
        return string.format("%d:%02d:%02d", hours, minutes, rest)
    end
    return string.format("%d:%02d", minutes, rest)
end
--- `mm:ss` used for lyric timestamps.
function ____exports.formatStamp(seconds)
    local minutes = math.floor(math.max(0, seconds) / 60)
    local rest = math.max(0, seconds) - minutes * 60
    return string.format("%02d:%05.2f", minutes, rest)
end
function ____exports.splitLines(value)
    return ____exports.matchList(value, "[^\r\n]+")
end
function ____exports.startsWith(value, prefix)
    return string.sub(value, 1, #prefix) == prefix
end
function ____exports.endsWith(value, suffix)
    if #suffix == 0 then
        return true
    end
    return string.sub(value, -#suffix) == suffix
end
--- Percent-encode a query component; space becomes `+`.
function ____exports.urlEncode(value)
    return ____exports.replace(
        value,
        "[^%w%-%.~_]",
        function(char)
            if char == " " then
                return "+"
            end
            return string.format(
                "%%%02X",
                ____exports.byteAt(char)
            )
        end
    )
end
--- Percent-encode a URL *path* segment: spaces become `%20`, not `+`.
function ____exports.pathEncode(value)
    return ____exports.replace(
        value,
        "([^%w%-%.~_])",
        function(char) return string.format(
            "%%%02X",
            ____exports.byteAt(char)
        ) end
    )
end
--- Join a base URL with a path and drop undefined query values.
function ____exports.buildUrl(base, path, query)
    local root = ____exports.replace(base, "/+$", "")
    local target = ____exports.startsWith(path, "/") and path or "/" .. path
    local url = root .. target
    if query ~= nil then
        local parts = {}
        local keys = {}
        for key in pairs(query) do
            keys[#keys + 1] = key
        end
        __TS__ArraySort(keys)
        for ____, key in ipairs(keys) do
            do
                local __continue47
                repeat
                    local value = query[key]
                    if value == nil then
                        __continue47 = true
                        break
                    end
                    parts[#parts + 1] = (____exports.urlEncode(key) .. "=") .. ____exports.urlEncode(tostring(value))
                    __continue47 = true
                until true
                if not __continue47 then
                    break
                end
            end
        end
        if #parts > 0 then
            url = (url .. "?") .. table.concat(parts, "&")
        end
    end
    return url
end
local function utf8char(codepoint)
    if codepoint <= 0 then
        return ""
    end
    return vim.fn.nr2char(codepoint)
end
--- Decode the XML entities lyric providers put inside their text.
function ____exports.decodeXmlEntities(value)
    local named = ____exports.replace(
        ____exports.replace(
            ____exports.replace(
                ____exports.replace(
                    ____exports.replace(value, "&lt;", "<"),
                    "&gt;",
                    ">"
                ),
                "&quot;",
                "\""
            ),
            "&apos;",
            "'"
        ),
        "&nbsp;",
        " "
    )
    local hex = ____exports.replace(
        named,
        "&#x([%x]+);",
        function(found) return utf8char(tonumber(found, 16) or 0) end
    )
    local decimal = ____exports.replace(
        hex,
        "&#(%d+);",
        function(found) return utf8char(tonumber(found, 10) or 0) end
    )
    return ____exports.replace(decimal, "&amp;", "&")
end
--- Strip tags (adding a space) and collapse whitespace: HTML-ish content.
function ____exports.plainText(value)
    return ____exports.trim(____exports.replace(
        ____exports.replace(
            ____exports.replace(
                ____exports.decodeXmlEntities(value),
                "<br%s*/?>",
                " "
            ),
            "<[^>]+>",
            " "
        ),
        "%s+",
        " "
    ))
end
--- Inline text of an XML fragment for TTML: tags are removed *without*
-- inserting a space (Apple/lrc.red files split one word across spans, e.g.
-- `<span>un</span><span>til</span>`), while whitespace text nodes between spans
-- survive as a single space.
function ____exports.inlineText(value)
    local spaced = ____exports.replace(value, "<br%s*/?>", " ")
    return ____exports.trim(____exports.replace(
        ____exports.decodeXmlEntities(____exports.replace(spaced, "<[^>]+>", "")),
        "%s+",
        " "
    ))
end
--- Normalise a title/artist for comparison: lower-case, no punctuation.
function ____exports.normalizeKey(value)
    return ____exports.trim(____exports.lower(____exports.replace(
        ____exports.replace(value, "[^%w%s]", " "),
        "%s+",
        " "
    )))
end
--- Word-overlap similarity in `0..1` used to rank fuzzy provider hits.
function ____exports.similarity(a, b)
    local left = ____exports.normalizeKey(a)
    local right = ____exports.normalizeKey(b)
    if left == "" then
        return 0
    end
    if left == right then
        return 1
    end
    if ____exports.indexOf(left, right) ~= nil or ____exports.indexOf(right, left) ~= nil then
        return 0.9
    end
    local shared = 0
    local total = 0
    for ____, word in ipairs(____exports.matchList(left, "%S+")) do
        total = total + 1
        if ____exports.indexOf(right, word) ~= nil then
            shared = shared + 1
        end
    end
    if total == 0 then
        return 0
    end
    return shared / total
end
--- Last path/URL segment with the query string removed.
function ____exports.displayName(source)
    local label = vim.fn.fnamemodify(
        ____exports.replace(source, "[?#].*$", ""),
        ":t"
    )
    return label == "" and source or label
end
--- `vim.json.decode` maps JSON `null` to the `vim.NIL` sentinel, so every
-- decoded field has to be type checked before it is used as a string.
function ____exports.asText(value, fallback)
    if fallback == nil then
        fallback = ""
    end
    return type(value) == "string" and value or fallback
end
function ____exports.asNumber(value)
    return type(value) == "number" and value or nil
end
function ____exports.asArray(value)
    return type(value) == "table" and value or ({})
end
function ____exports.asRecord(value)
    return type(value) == "table" and value or ({})
end
--- Decode JSON without throwing; returns `undefined` when it is not JSON.
function ____exports.decodeJson(text)
    if ____exports.trim(text) == "" then
        return nil
    end
    local result = {pcall(function() return vim.json.decode(text) end)}
    local ____result__0_0
    if result[1] then
        ____result__0_0 = result[2]
    else
        ____result__0_0 = nil
    end
    return ____result__0_0
end
return ____exports
