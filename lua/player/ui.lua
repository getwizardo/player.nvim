-- Lua Library inline imports
local function __TS__ObjectKeys(obj)
    local result = {}
    local len = 0
    for key in pairs(obj) do
        len = len + 1
        result[len] = key
    end
    return result
end

local function __TS__ArrayForEach(self, callbackFn, thisArg)
    for i = 1, #self do
        callbackFn(thisArg, self[i], i - 1, self)
    end
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
-- End of Lua Library inline imports
local ____exports = {}
local bufferFor, writeLines, providerGroups, renderResults, progressBar, renderNow, renderTransport, seekStep, namespace, dash
local highlights = require("player.highlights")
local ____config = require("player.config")
local getOptions = ____config.get
local ____util = require("player.util")
local clamp = ____util.clamp
local clamp01 = ____util.clamp01
local formatTime = ____util.formatTime
local indexOf = ____util.indexOf
local lower = ____util.lower
local notify = ____util.notify
local padRight = ____util.padRight
local rep = ____util.rep
local sub = ____util.sub
local trim = ____util.trim
local upper = ____util.upper
function bufferFor(win, name)
    local ____temp_0
    if win == nil then
        ____temp_0 = nil
    else
        ____temp_0 = vim.api.nvim_win_get_buf(win)
    end
    local existing = ____temp_0
    if existing ~= nil and vim.api.nvim_buf_is_valid(existing) then
        return existing
    end
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_name(buf, name)
    vim.bo[buf].buftype = "nofile"
    vim.bo[buf].bufhidden = "wipe"
    vim.bo[buf].swapfile = false
    return buf
end
function writeLines(buf, lines)
    vim.bo[buf].modifiable = true
    vim.api.nvim_buf_set_lines(
        buf,
        0,
        -1,
        false,
        lines
    )
    vim.bo[buf].modifiable = false
end
function providerGroups()
    local groups = {}
    __TS__ArrayForEach(
        dash.tracks,
        function(____, track, index)
            local last = groups[#groups]
            if last ~= nil and last.provider == track.provider then
                last.count = last.count + 1
                return
            end
            groups[#groups + 1] = {provider = track.provider, first = index, count = 1}
        end
    )
    return groups
end
function renderResults()
    local win = dash.windows.results
    if win == nil or not vim.api.nvim_win_is_valid(win) then
        return
    end
    local buf = bufferFor(
        win,
        "player://results-" .. tostring(vim.uv.hrtime())
    )
    local groups = providerGroups()
    local lines = {}
    lines[#lines + 1] = "  DISCOVER"
    local subject = dash.query == "" and "" or (" for \"" .. dash.query) .. "\""
    lines[#lines + 1] = ((("  " .. tostring(#dash.tracks)) .. " track(s)") .. subject) .. (dash.filter == "" and "" or (" matching \"" .. dash.filter) .. "\"")
    lines[#lines + 1] = "  sources: " .. table.concat(
        getOptions().search.sources,
        ", "
    )
    lines[#lines + 1] = ""
    local groupRows = {}
    local trackRows = {}
    if #dash.tracks == 0 then
        lines[#lines + 1] = "  Nothing found yet."
        lines[#lines + 1] = "  Run :Player <query> to search,"
        lines[#lines + 1] = "  :PlayerUrl <url> to play a link,"
        lines[#lines + 1] = "  or press r to repeat the last search."
    end
    local group = -1
    __TS__ArrayForEach(
        dash.tracks,
        function(____, track, index)
            local current = -1
            __TS__ArrayForEach(
                groups,
                function(____, item, position)
                    if index >= item.first and index < item.first + item.count then
                        current = position
                    end
                end
            )
            if current ~= group then
                group = current
                groupRows[#groupRows + 1] = #lines
                local ____upper_3 = upper
                local ____opt_1 = groups[group + 1]
                lines[#lines + 1] = "  " .. ____upper_3(____opt_1 and ____opt_1.provider or "")
            end
            local marker = index == dash.selection and "▶" or " "
            trackRows[#trackRows + 1] = #lines
            lines[#lines + 1] = ((("  " .. marker) .. " ") .. padRight(
                tostring(index + 1) .. ".",
                4
            )) .. track.title
            lines[#lines + 1] = ("    " .. trim(track.artist)) .. (track.duration ~= nil and track.duration > 0 and "  ·  " .. formatTime(track.duration) or "")
        end
    )
    lines[#lines + 1] = ""
    lines[#lines + 1] = "  <CR> play   <C-y> lyrics   <Tab> source   / filter   q close"
    writeLines(buf, lines)
    vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1)
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
    for ____, row in ipairs(groupRows) do
        vim.api.nvim_buf_set_extmark(
            buf,
            namespace,
            row,
            0,
            {line_hl_group = "PlayerSection", priority = 80}
        )
    end
    local cursorRow = -1
    __TS__ArrayForEach(
        dash.tracks,
        function(____, _track, index)
            local row = trackRows[index + 1]
            if row == nil then
                return
            end
            if index == dash.selection then
                cursorRow = row
            end
        end
    )
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        #lines - 1,
        0,
        {line_hl_group = "PlayerMuted", priority = 60}
    )
    if cursorRow >= 0 then
        pcall(function() return vim.api.nvim_win_set_cursor(win, {cursorRow + 1, 0}) end)
    end
end
function progressBar(position, duration, width)
    if duration <= 0 then
        return (rep("─", width) .. "  ") .. formatTime(position)
    end
    local filled = math.floor(clamp01(position / duration) * width)
    return (((((rep("─", filled) .. "●") .. rep("─", width - filled - 1)) .. "  ") .. formatTime(position)) .. " / ") .. formatTime(duration)
end
function renderNow()
    local win = dash.windows.now
    if win == nil or not vim.api.nvim_win_is_valid(win) then
        return
    end
    local buf = bufferFor(
        win,
        "player://now-" .. tostring(vim.uv.hrtime())
    )
    local now = dash.now
    local state = dash.buffering and "BUFFERING" or (dash.playing and "NOW PLAYING" or "PAUSED")
    local lines = {}
    lines[#lines + 1] = "  QUEUE"
    lines[#lines + 1] = "  " .. (now == nil and "nothing playing" or now.title)
    lines[#lines + 1] = "  " .. (now == nil and "search for something to play" or now.artist)
    lines[#lines + 1] = ""
    lines[#lines + 1] = "  " .. state
    lines[#lines + 1] = "  source   " .. (now == nil and "—" or now.provider)
    if now ~= nil and now.album ~= "" then
        lines[#lines + 1] = "  album    " .. now.album
    end
    lines[#lines + 1] = "  lyrics   " .. dash.lyrics
    lines[#lines + 1] = ("  volume   " .. tostring(dash.volume)) .. "%"
    if dash.visualizer then
        lines[#lines + 1] = "  visual   on (press v to stop)"
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "  <Space> play/pause   [ ] prev/next"
    lines[#lines + 1] = "  h l seek · - + volume · v visual"
    lines[#lines + 1] = "  y lyrics · t translate · s stop · q close"
    writeLines(buf, lines)
    vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1)
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
        4,
        0,
        {line_hl_group = "PlayerAccent", priority = 80}
    )
    do
        local row = 5
        while row < #lines - 3 do
            vim.api.nvim_buf_set_extmark(
                buf,
                namespace,
                row,
                0,
                {line_hl_group = "PlayerMuted", priority = 60}
            )
            row = row + 1
        end
    end
    do
        local row = #lines - 3
        while row < #lines do
            vim.api.nvim_buf_set_extmark(
                buf,
                namespace,
                row,
                0,
                {line_hl_group = "PlayerMuted", priority = 60}
            )
            row = row + 1
        end
    end
end
function renderTransport()
    local win = dash.windows.transport
    if win == nil or not vim.api.nvim_win_is_valid(win) then
        return
    end
    local buf = bufferFor(
        win,
        "player://transport-" .. tostring(vim.uv.hrtime())
    )
    local width = vim.api.nvim_win_get_width(win)
    local bar = math.max(8, width - 42)
    local glyph = dash.buffering and "◐" or (dash.playing and "❚❚" or "▶")
    local text = (((((" ⏮  " .. glyph) .. "  ⏭  ") .. progressBar(dash.position, dash.duration, bar)) .. "  ") .. tostring(dash.volume)) .. "% "
    writeLines(
        buf,
        {sub(text, 1, width)}
    )
    vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1)
    vim.api.nvim_buf_set_extmark(
        buf,
        namespace,
        0,
        0,
        {line_hl_group = "PlayerBar", priority = 80}
    )
end
function seekStep()
    return getOptions().seek_step
end
namespace = vim.api.nvim_create_namespace("player.nvim.dashboard")
dash = {
    tracks = {},
    selection = 0,
    position = 0,
    duration = 0,
    volume = 80,
    playing = false,
    buffering = false,
    lyrics = "no lyrics loaded",
    filter = "",
    query = "",
    visualizer = false,
    windows = {}
}
local function call(handler)
    local handlers = dash.handlers
    if handlers == nil then
        return
    end
    handlers[handler]()
end
function ____exports.wire(handlers)
    dash.handlers = handlers
end
function ____exports.setQuery(query)
    dash.query = query
end
function ____exports.setTracks(tracks)
    dash.tracks = tracks
    dash.selection = 0
    renderResults()
end
function ____exports.selection()
    return dash.tracks[dash.selection + 1]
end
function ____exports.trackCount()
    return #dash.tracks
end
function ____exports.setNow(info)
    dash.now = info
    dash.position = 0
    dash.duration = info.duration
    renderNow()
    renderTransport()
end
function ____exports.setProgress(position, duration)
    dash.position = position
    dash.duration = duration
    renderTransport()
end
function ____exports.setPlaying(playing)
    dash.playing = playing
    renderTransport()
end
function ____exports.setBuffering(buffering)
    dash.buffering = buffering
    renderTransport()
end
function ____exports.setVolume(volume)
    dash.volume = clamp(volume, 0, 100)
    renderTransport()
end
function ____exports.setLyricStatus(text)
    dash.lyrics = text
    renderNow()
end
function ____exports.setVisualizer(enabled)
    dash.visualizer = enabled
    renderNow()
end
function ____exports.isOpen()
    for ____, key in ipairs(__TS__ObjectKeys(dash.windows)) do
        local win = dash.windows[key]
        if win ~= nil and vim.api.nvim_win_is_valid(win) then
            return true
        end
    end
    return false
end
local function closeWindow(win)
    if win ~= nil and vim.api.nvim_win_is_valid(win) then
        pcall(function() return vim.api.nvim_win_close(win, true) end)
    end
end
function ____exports.close()
    closeWindow(dash.windows.results)
    closeWindow(dash.windows.now)
    closeWindow(dash.windows.transport)
    dash.windows = {}
end
local function floatConfig(width, height, row, col)
    return {
        relative = "editor",
        width = width,
        height = height,
        row = row,
        col = col,
        style = "minimal",
        border = "rounded"
    }
end
local function geometry()
    local columns = vim.o.columns
    local rows = vim.o.lines
    local resultsWidth = math.floor(clamp(columns * 0.58, 30, 96))
    return {
        resultsWidth = resultsWidth,
        nowWidth = math.max(24, columns - resultsWidth - 8),
        height = clamp(rows - 8, 8, 40),
        rows = rows,
        columns = columns
    }
end
local function layout()
    local ____geometry_result_4 = geometry()
    local resultsWidth = ____geometry_result_4.resultsWidth
    local nowWidth = ____geometry_result_4.nowWidth
    local height = ____geometry_result_4.height
    local rows = ____geometry_result_4.rows
    if dash.windows.results ~= nil and vim.api.nvim_win_is_valid(dash.windows.results) then
        vim.api.nvim_win_set_config(
            dash.windows.results,
            floatConfig(resultsWidth, height, 2, 2)
        )
    end
    if dash.windows.now ~= nil and vim.api.nvim_win_is_valid(dash.windows.now) then
        vim.api.nvim_win_set_config(
            dash.windows.now,
            floatConfig(nowWidth, height, 2, resultsWidth + 4)
        )
    end
    if dash.windows.transport ~= nil and vim.api.nvim_win_is_valid(dash.windows.transport) then
        vim.api.nvim_win_set_config(
            dash.windows.transport,
            floatConfig(
                math.max(28, resultsWidth + nowWidth + 2),
                1,
                rows - 3,
                2
            )
        )
    end
end
local function bindResults(buf)
    local function map(key, handler, description)
        return vim.keymap.set("n", key, handler, {buffer = buf, silent = true, desc = description})
    end
    map(
        "<CR>",
        function() return call("playSelection") end,
        "Play the selected track"
    )
    map(
        "o",
        function() return call("playSelection") end,
        "Play the selected track"
    )
    map(
        "<C-y>",
        function() return call("openLyrics") end,
        "Load lyrics for the selected track"
    )
    map(
        "<Tab>",
        function()
            local after = __TS__ArrayFilter(
                providerGroups(),
                function(____, group) return group.first > dash.selection end
            )[1]
            dash.selection = after == nil and 0 or after.first
            renderResults()
        end,
        "Jump to the next source"
    )
    map(
        "<S-Tab>",
        function()
            local target = 0
            for ____, group in ipairs(providerGroups()) do
                if group.first < dash.selection then
                    target = group.first
                end
            end
            dash.selection = target
            renderResults()
        end,
        "Jump to the previous source"
    )
    map(
        "j",
        function()
            dash.selection = clamp(
                dash.selection + 1,
                0,
                math.max(0, #dash.tracks - 1)
            )
            renderResults()
        end,
        "Next result"
    )
    map(
        "k",
        function()
            dash.selection = clamp(
                dash.selection - 1,
                0,
                math.max(0, #dash.tracks - 1)
            )
            renderResults()
        end,
        "Previous result"
    )
    map(
        "/",
        function()
            vim.ui.input(
                {prompt = "Filter results: ", default = dash.filter},
                function(value)
                    dash.filter = value == nil and "" or trim(value)
                    if dash.filter == "" then
                        renderResults()
                        return
                    end
                    local needle = lower(dash.filter)
                    local filtered = {}
                    for ____, track in ipairs(dash.tracks) do
                        if indexOf(
                            lower((((track.title .. " ") .. track.artist) .. " ") .. (track.album or "")),
                            needle
                        ) ~= nil then
                            filtered[#filtered + 1] = track
                        end
                    end
                    if #filtered == 0 then
                        notify("No result matched that filter.", vim.log.levels.WARN)
                        return
                    end
                    dash.tracks = filtered
                    dash.selection = 0
                    renderResults()
                end
            )
        end,
        "Filter the visible results"
    )
    map(
        "r",
        function() return call("reSearch") end,
        "Repeat the last search"
    )
    map(
        "q",
        function() return call("close") end,
        "Close the dashboard"
    )
    map(
        "<Esc>",
        function() return call("close") end,
        "Close the dashboard"
    )
    do
        local index = 1
        while index <= 9 do
            map(
                tostring(index),
                function()
                    dash.selection = index - 1
                    call("playSelection")
                end,
                "Play result " .. tostring(index)
            )
            index = index + 1
        end
    end
end
local function bindNow(buf)
    local function map(key, handler, description)
        return vim.keymap.set("n", key, handler, {buffer = buf, silent = true, desc = description})
    end
    map(
        "<Space>",
        function() return call("togglePlay") end,
        "Play / pause"
    )
    map(
        "]",
        function() return call("next") end,
        "Next track"
    )
    map(
        "[",
        function() return call("previous") end,
        "Previous track"
    )
    map(
        "l",
        function()
            local handlers = dash.handlers
            if handlers ~= nil then
                handlers.seekRelative(seekStep())
            end
        end,
        "Seek forward"
    )
    map(
        "h",
        function()
            local handlers = dash.handlers
            if handlers ~= nil then
                handlers.seekRelative(-seekStep())
            end
        end,
        "Seek back"
    )
    map(
        "=",
        function()
            local handlers = dash.handlers
            if handlers ~= nil then
                handlers.nudgeVolume(5)
            end
        end,
        "Volume up"
    )
    map(
        "+",
        function()
            local handlers = dash.handlers
            if handlers ~= nil then
                handlers.nudgeVolume(5)
            end
        end,
        "Volume up"
    )
    map(
        "-",
        function()
            local handlers = dash.handlers
            if handlers ~= nil then
                handlers.nudgeVolume(-5)
            end
        end,
        "Volume down"
    )
    map(
        "v",
        function() return call("toggleVisualizer") end,
        "Toggle the audio visualizer"
    )
    map(
        "y",
        function() return call("openLyrics") end,
        "Lyrics for the current track"
    )
    map(
        "t",
        function() return call("translate") end,
        "Translate the open lyrics"
    )
    map(
        "s",
        function() return call("stop") end,
        "Stop playback"
    )
    map(
        "q",
        function() return call("close") end,
        "Close the dashboard"
    )
    map(
        "<Esc>",
        function() return call("close") end,
        "Close the dashboard"
    )
end
--- Open (or refocus) the dashboard.
function ____exports.open()
    if ____exports.isOpen() then
        layout()
        renderResults()
        renderNow()
        renderTransport()
        return
    end
    highlights.define()
    local ____geometry_result_5 = geometry()
    local resultsWidth = ____geometry_result_5.resultsWidth
    local nowWidth = ____geometry_result_5.nowWidth
    local height = ____geometry_result_5.height
    local rows = ____geometry_result_5.rows
    local results = vim.api.nvim_open_win(
        bufferFor(
            nil,
            "player://results-" .. tostring(vim.uv.hrtime())
        ),
        true,
        floatConfig(resultsWidth, height, 2, 2)
    )
    local now = vim.api.nvim_open_win(
        bufferFor(
            nil,
            "player://now-" .. tostring(vim.uv.hrtime())
        ),
        false,
        floatConfig(nowWidth, height, 2, resultsWidth + 4)
    )
    local transport = vim.api.nvim_open_win(
        bufferFor(
            nil,
            "player://transport-" .. tostring(vim.uv.hrtime())
        ),
        false,
        {
            relative = "editor",
            width = math.max(28, resultsWidth + nowWidth + 2),
            height = 1,
            row = rows - 3,
            col = 2,
            style = "minimal",
            border = "rounded",
            focusable = false
        }
    )
    dash.windows = {results = results, now = now, transport = transport}
    for ____, win in ipairs({results, now}) do
        vim.wo[win].winhl = highlights.floatHighlights()
        vim.wo[win].wrap = false
        vim.wo[win].cursorline = false
        vim.wo[win].number = false
        vim.wo[win].signcolumn = "no"
        vim.wo[win].spell = false
    end
    local resultsBuf = vim.api.nvim_win_get_buf(results)
    local nowBuf = vim.api.nvim_win_get_buf(now)
    vim.bo[resultsBuf].filetype = "playerresults"
    vim.bo[nowBuf].filetype = "playernow"
    vim.bo[vim.api.nvim_win_get_buf(transport)].filetype = "playertransport"
    bindResults(resultsBuf)
    bindNow(nowBuf)
    renderResults()
    renderNow()
    renderTransport()
    if dash.resizeAutocmd ~= nil then
        pcall(function() return vim.api.nvim_del_autocmd(dash.resizeAutocmd) end)
    end
    dash.resizeAutocmd = vim.api.nvim_create_autocmd(
        "VimResized",
        {callback = function()
            if ____exports.isOpen() then
                layout()
            end
            return false
        end}
    )
    notify(("Search sources: " .. table.concat(
        getOptions().search.sources,
        ", "
    )) .. ".")
end
return ____exports
