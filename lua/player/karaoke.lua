-- Lua Library inline imports
local function __TS__ArrayForEach(self, callbackFn, thisArg)
    for i = 1, #self do
        callbackFn(thisArg, self[i], i - 1, self)
    end
end
-- End of Lua Library inline imports
local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local highlights = require("player.highlights")
local lyrics = require("player.lyrics")
local mpv = require("player.mpv")
local translate = require("player.translate")
local ____util = require("player.util")
local clamp = ____util.clamp
local formatStamp = ____util.formatStamp
local indexOf = ____util.indexOf
local notify = ____util.notify
local rep = ____util.rep
local trim = ____util.trim
local namespace = vim.api.nvim_create_namespace("player.nvim.karaoke")
local active = {rows = {}, current = -1, follow = true}
--- Last known playback position, reused when the buffer is re-rendered.
local lastPosition = 0
local function stopTimer()
    if active.timer ~= nil then
        active.timer.stop()
        if not active.timer.is_closing() then
            active.timer.close()
        end
        active.timer = nil
    end
end
function ____exports.close()
    stopTimer()
    if active.win ~= nil and vim.api.nvim_win_is_valid(active.win) then
        pcall(function() return vim.api.nvim_win_close(active.win, true) end)
    end
    active.win = nil
    active.buf = nil
    active.rows = {}
    active.current = -1
    active.set = nil
end
function ____exports.isOpen()
    return active.win ~= nil and vim.api.nvim_win_is_valid(active.win)
end
function ____exports.hasLyrics()
    return active.set ~= nil and #active.set.lines > 0
end
--- Byte column of every word inside the rendered line text. The result is
-- index-aligned with the input words; `start < 0` marks a word that could not
-- be located (the line text then keeps its plain highlight).
local function wordSpans(text, column, words)
    local spans = {}
    local cursor = 1
    for ____, word in ipairs(words) do
        do
            local __continue11
            repeat
                local found = indexOf(text, word.text, cursor)
                if found == nil then
                    spans[#spans + 1] = {start = -1, ["end"] = -1}
                    __continue11 = true
                    break
                end
                spans[#spans + 1] = {start = column + found - 1, ["end"] = column + found - 1 + #word.text}
                cursor = found + #word.text
                __continue11 = true
            until true
            if not __continue11 then
                break
            end
        end
    end
    return spans
end
local function render()
    local set = active.set
    local buf = active.buf
    if set == nil or buf == nil or not vim.api.nvim_buf_is_valid(buf) then
        return
    end
    local header = {
        "  KARAOKE",
        "  " .. (set.title == "" and "Lyrics" or set.title),
        ("  " .. set.artist) .. (set.album == "" and "" or " · " .. set.album),
        "  " .. lyrics.describeSet(set),
        ""
    }
    local lines = {}
    for ____, line in ipairs(header) do
        lines[#lines + 1] = line
    end
    local rows = {}
    local lastPart = ""
    __TS__ArrayForEach(
        set.lines,
        function(____, line, index)
            if line.part ~= nil and line.part ~= lastPart then
                lastPart = line.part
                lines[#lines + 1] = ("  ── " .. line.part) .. " ──"
            end
            local prefix = line.start > 0 and ("  " .. formatStamp(line.start)) .. "   " or "  "
            local bufferRow = #lines
            lines[#lines + 1] = prefix .. line.text
            local row = {
                index = index,
                bufferRow = bufferRow,
                column = #prefix,
                words = line.words ~= nil and wordSpans(line.text, #prefix, line.words) or ({})
            }
            if line.translation ~= nil and line.translation ~= "" then
                lines[#lines + 1] = rep(" ", #prefix) .. line.translation
                row.translationRow = #lines - 1
            end
            rows[#rows + 1] = row
        end
    )
    if #set.lines == 0 then
        lines[#lines + 1] = "  No lyrics found for this track."
    end
    vim.bo[buf].modifiable = true
    vim.api.nvim_buf_set_lines(
        buf,
        0,
        -1,
        false,
        lines
    )
    vim.bo[buf].modifiable = false
    vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1)
    active.rows = rows
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        0,
        0,
        {line_hl_group = "PlayerEyebrow", priority = 80}
    )
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        1,
        0,
        {line_hl_group = "PlayerTitle", priority = 80}
    )
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        2,
        0,
        {line_hl_group = "PlayerMuted", priority = 80}
    )
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        3,
        0,
        {line_hl_group = "PlayerAccent", priority = 80}
    )
    for ____, row in ipairs(rows) do
        vim.api.nvim_buf_set_extmark(
            buf,
            namespace,
            row.bufferRow,
            0,
            {end_row = row.bufferRow, end_col = row.column, hl_group = "PlayerTimestamp", priority = 70}
        )
    end
    active.current = -1
end
local function resize()
    local buf = active.buf
    local win = active.win
    if buf == nil or win == nil or not vim.api.nvim_win_is_valid(win) then
        return
    end
    local width = clamp(vim.o.columns - 8, 30, 84)
    local height = clamp(
        vim.api.nvim_buf_line_count(buf) + 1,
        8,
        math.max(8, vim.o.lines - 6)
    )
    vim.api.nvim_win_set_config(
        win,
        {
            relative = "editor",
            width = width,
            height = height,
            row = math.max(
                0,
                math.floor((vim.o.lines - height) / 2)
            ),
            col = math.max(
                0,
                math.floor((vim.o.columns - width) / 2)
            ),
            style = "minimal",
            border = "rounded",
            title = "  ♪  player.nvim  ",
            title_pos = "center"
        }
    )
end
local function findCurrent(position)
    local set = active.set
    if set == nil or #set.lines == 0 then
        return -1
    end
    local current = -1
    __TS__ArrayForEach(
        set.lines,
        function(____, line, index)
            if line.start <= position then
                current = index
            end
        end
    )
    if current == -1 then
        current = 0
    end
    return current
end
--- Redraw the highlight for a playback position (called ~5x per second).
function ____exports.update(position)
    local set = active.set
    local buf = active.buf
    if set == nil or buf == nil or not vim.api.nvim_buf_is_valid(buf) then
        stopTimer()
        return
    end
    local current = findCurrent(position)
    local row = active.rows[current + 1]
    local changed = current ~= active.current
    active.current = current
    vim.api.nvim_buf_clear_namespace(buf, namespace, 4, -1)
    for ____, item in ipairs(active.rows) do
        vim.api.nvim_buf_set_extmark(
            buf,
            namespace,
            item.bufferRow,
            0,
            {end_row = item.bufferRow, end_col = item.column, hl_group = "PlayerTimestamp", priority = 70}
        )
    end
    if row == nil then
        return
    end
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        row.bufferRow,
        0,
        {line_hl_group = "PlayerLyricActive", priority = 90}
    )
    if row.translationRow ~= nil then
        vim.api.nvim_buf_set_extmark(
            buf,
            namespace,
            row.translationRow,
            0,
            {line_hl_group = "PlayerTranslation", priority = 85}
        )
    end
    local line = set.lines[row.index + 1]
    if line.words ~= nil then
        __TS__ArrayForEach(
            line.words,
            function(____, word, position2)
                local span = row.words[position2 + 1]
                if span == nil or span.start < 0 then
                    return
                end
                if word.start > position then
                    return
                end
                local sung = word.finish > 0 and word.finish <= position
                vim.api.nvim_buf_set_extmark(
                    buf,
                    namespace,
                    row.bufferRow,
                    span.start,
                    {end_row = row.bufferRow, end_col = span["end"], hl_group = sung and "PlayerKaraokeSung" or "PlayerKaraokeWord", priority = sung and 100 or 120}
                )
            end
        )
    end
    if not changed or not active.follow then
        return
    end
    local win = active.win
    if win == nil or not vim.api.nvim_win_is_valid(win) then
        return
    end
    pcall(function() return vim.api.nvim_win_set_cursor(win, {row.bufferRow + 1, 0}) end)
    pcall(function() return vim.api.nvim_win_call(
        win,
        function() return vim.cmd("normal! zz") end
    ) end)
end
--- Jump playback to a lyric line (`[` / `]` in the float).
local function jump(delta)
    local set = active.set
    if set == nil or #set.lines == 0 then
        return
    end
    local current = active.current < 0 and 0 or active.current
    local target = clamp(current + delta, 0, #set.lines - 1)
    active.current = target
    mpv.seek(math.max(0, set.lines[target + 1].start - 0.2))
end
function ____exports.translateTo(target)
    local set = active.set
    if set == nil or #set.lines == 0 then
        notify("Open lyrics before translating.", vim.log.levels.WARN)
        return
    end
    local function run(language)
        local code = trim(language)
        if code == "" then
            return
        end
        notify(((("Translating " .. tostring(#set.lines)) .. " line(s) to ") .. code) .. "…")
        translate.translateLines(
            set.lines,
            code,
            function(values, ____error)
                if values == nil then
                    notify("Translation: " .. (____error or "unknown error"), vim.log.levels.ERROR)
                    return
                end
                __TS__ArrayForEach(
                    set.lines,
                    function(____, line, index)
                        line.translation = values[index + 1]
                    end
                )
                render()
                resize()
                ____exports.update(lastPosition)
                notify(("Lyrics translated to " .. code) .. ".")
            end
        )
    end
    if target ~= nil and trim(target) ~= "" then
        run(target)
        return
    end
    vim.ui.input(
        {prompt = "Target language code (en, vi, ja, hi, …): ", default = "en"},
        function(value)
            if value ~= nil then
                run(value)
            end
        end
    )
end
local function toggleFollow()
    active.follow = not active.follow
    getOptions().lyric.follow = active.follow
    notify(("Karaoke follow " .. (active.follow and "on" or "off")) .. ".")
end
local function mapKey(key, handler, description)
    local buf = active.buf
    if buf == nil then
        return
    end
    vim.keymap.set("n", key, handler, {buffer = buf, silent = true, desc = description})
end
--- Show a resolved lyric set in the float and start following playback.
function ____exports.open(set)
    stopTimer()
    ____exports.close()
    highlights.define()
    active.set = set
    active.follow = getOptions().lyric.follow
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_name(
        buf,
        "player://karaoke-" .. tostring(vim.uv.hrtime())
    )
    vim.bo[buf].buftype = "nofile"
    vim.bo[buf].bufhidden = "wipe"
    vim.bo[buf].swapfile = false
    vim.bo[buf].filetype = "playerlyrics"
    active.buf = buf
    render()
    active.win = vim.api.nvim_open_win(
        buf,
        true,
        {
            relative = "editor",
            width = clamp(vim.o.columns - 8, 30, 84),
            height = clamp(
                vim.api.nvim_buf_line_count(buf) + 1,
                8,
                math.max(8, vim.o.lines - 6)
            ),
            row = math.max(
                0,
                math.floor((vim.o.lines - math.min(
                    vim.o.lines - 6,
                    vim.api.nvim_buf_line_count(buf) + 1
                )) / 2)
            ),
            col = math.max(
                0,
                math.floor((vim.o.columns - clamp(vim.o.columns - 8, 30, 84)) / 2)
            ),
            style = "minimal",
            border = "rounded",
            title = "  ♪  player.nvim  ",
            title_pos = "center"
        }
    )
    resize()
    vim.wo[active.win].winhl = highlights.floatHighlights()
    vim.wo[active.win].wrap = true
    vim.wo[active.win].cursorline = false
    vim.wo[active.win].number = false
    vim.wo[active.win].signcolumn = "no"
    vim.wo[active.win].foldenable = false
    mapKey(
        "q",
        function() return ____exports.close() end,
        "Close karaoke lyrics"
    )
    mapKey(
        "<Esc>",
        function() return ____exports.close() end,
        "Close karaoke lyrics"
    )
    mapKey(
        "t",
        function() return ____exports.translateTo(nil) end,
        "Translate the open lyrics"
    )
    mapKey(
        "f",
        function() return toggleFollow() end,
        "Toggle lyric follow"
    )
    mapKey(
        "[",
        function() return jump(-1) end,
        "Seek to the previous lyric line"
    )
    mapKey(
        "]",
        function() return jump(1) end,
        "Seek to the next lyric line"
    )
    mapKey(
        "j",
        function()
            active.follow = false
            vim.cmd("normal! j")
        end,
        "Scroll down (disables follow)"
    )
    mapKey(
        "k",
        function()
            active.follow = false
            vim.cmd("normal! k")
        end,
        "Scroll up (disables follow)"
    )
    local timer = vim.uv.new_timer()
    active.timer = timer
    timer.start(
        0,
        200,
        vim.schedule_wrap(function()
            if not ____exports.isOpen() then
                stopTimer()
                return
            end
            mpv.poll(
                "time-pos",
                function(value)
                    if value == nil then
                        return
                    end
                    lastPosition = value
                    ____exports.update(value)
                end
            )
        end)
    )
end
--- Keep the header in sync when the track changes.
function ____exports.refresh()
    if active.set == nil then
        return
    end
    render()
    resize()
end
return ____exports
