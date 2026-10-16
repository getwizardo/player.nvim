--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
--- Pure formatting helpers shared by the dashboard, the queue browser and the
-- lyric viewer. They never touch the Neovim API, which keeps them easy to
-- reason about and to test.
local EQ_BLOCKS = {
    "▁",
    "▂",
    "▃",
    "▄",
    "▅",
    "▆",
    "▇",
    "█"
}
--- Format a number of seconds as `m:ss` (or `h:mm:ss` for long tracks).
function ____exports.formatClock(seconds)
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
--- Format a duration the same way `formatClock` does, but always padded.
function ____exports.formatDuration(seconds)
    if seconds == nil or seconds < 0 then
        return "0:00"
    end
    return ____exports.formatClock(seconds)
end
--- Turn a path or URL into a short label.
-- 
-- Query strings and fragments are dropped, the file name is kept.
function ____exports.sourceLabel(source)
    local path = source
    local cut = string.find(path, "[?#]", 1)
    if cut ~= nil then
        path = string.sub(path, 1, cut - 1)
    end
    local slash = 0
    do
        local position = 1
        while position <= #path do
            if string.sub(path, position, position) == "/" then
                slash = position
            end
            position = position + 1
        end
    end
    if slash > 0 then
        path = string.sub(path, slash + 1)
    end
    if path == "" then
        return source
    end
    return path
end
--- Render the ten band equalizer as a block bar.
function ____exports.eqCurve(bands, enabled)
    local blocks = {}
    do
        local index = 0
        while index < #bands do
            local gain = enabled and bands[index + 1] or -12
            local clamped = gain < -12 and -12 or (gain > 12 and 12 or gain)
            local level = math.floor((clamped + 12) / 3) + 1
            if level < 1 then
                level = 1
            end
            if level > 8 then
                level = 8
            end
            blocks[#blocks + 1] = EQ_BLOCKS[level]
            index = index + 1
        end
    end
    return table.concat(blocks, "  ")
end
--- Render the progress bar of the dashboard.
function ____exports.progressBar(position, duration, width)
    local ratio = 0
    if duration > 0 then
        ratio = position / duration
        if ratio < 0 then
            ratio = 0
        end
        if ratio > 1 then
            ratio = 1
        end
    end
    local filled = math.floor(width * ratio)
    local bar = string.rep("━", filled)
    if filled < width then
        bar = bar .. "●"
        bar = bar .. string.rep("─", width - filled - 1)
    end
    return bar
end
--- Pad a string on the right so that columns line up.
function ____exports.padRight(text, width)
    if #text >= width then
        return text
    end
    return text .. string.rep(" ", width - #text)
end
--- Shorten a string to `max` characters, adding an ellipsis when cut.
function ____exports.truncate(text, max)
    if max <= 1 or #text <= max then
        return text
    end
    return string.sub(text, 1, max - 1) .. "…"
end
--- Escape the characters that would break a single line in the dashboard.
function ____exports.singleLine(text)
    return string.gsub(text, "[%c\r\n]+", " ")
end
return ____exports
