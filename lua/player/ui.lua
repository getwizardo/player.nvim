--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____actions = require("player.actions")
local actions = ____actions.actions
local ____config = require("player.config")
local options = ____config.options
local ____format = require("player.format")
local eqCurve = ____format.eqCurve
local formatClock = ____format.formatClock
local progressBar = ____format.progressBar
local singleLine = ____format.singleLine
local truncate = ____format.truncate
local mpv = require("player.mpv")
local ____queue = require("player.queue")
local queueInfo = ____queue.queueInfo
local state = {
    buffer = 0,
    window = 0,
    timer = nil,
    frame = 0,
    title = "No track selected",
    artist = "Choose a local track or search a service",
    position = 0,
    duration = 0,
    paused = false,
    volume = 0,
    observers = {}
}
local namespace = vim.api.nvim_create_namespace("player.nvim.dashboard")
local pulses = {"◉", "◎", "◍", "◉"}
local function setStyle()
    vim.api.nvim_set_hl(0, "PlayerSurface", {bg = "#17151d", fg = "#eeeaf2", default = true})
    vim.api.nvim_set_hl(0, "PlayerBorder", {fg = "#d85c86", bg = "#17151d", default = true})
    vim.api.nvim_set_hl(0, "PlayerEyebrow", {fg = "#e58ca5", bold = true, default = true})
    vim.api.nvim_set_hl(0, "PlayerTitle", {fg = "#fff7fb", bold = true, default = true})
    vim.api.nvim_set_hl(0, "PlayerMuted", {fg = "#aaa1b2", default = true})
    vim.api.nvim_set_hl(0, "PlayerAccent", {fg = "#ff739b", bold = true, default = true})
    vim.api.nvim_set_hl(0, "PlayerBar", {fg = "#b85e85", default = true})
    vim.api.nvim_set_hl(0, "PlayerOk", {fg = "#7fd1a6", default = true})
end
local function stopTimer()
    local timer = state.timer
    if timer ~= nil then
        timer.stop(timer)
        timer.close(timer)
        state.timer = nil
    end
end
local function stopObservers()
    do
        local index = 0
        while index < #state.observers do
            mpv.unobserve(state.observers[index + 1])
            index = index + 1
        end
    end
    state.observers = {}
end
local function buildLines()
    local settings = options()
    local queue = queueInfo()
    local pulse = pulses[state.frame % #pulses + 1]
    local title = truncate(
        singleLine(state.title),
        46
    )
    local artist = truncate(
        singleLine(state.artist),
        46
    )
    local position = formatClock(state.position)
    local duration = formatClock(state.duration)
    local bar = progressBar(state.position, state.duration, 34)
    local playback = state.paused and "PAUSED" or "PLAYING"
    local ____repeat = queue["repeat"]
    local shuffle = queue.shuffle and "shuffle" or "ordered"
    return {
        "  PLAYER  ·  MUSIC FOR THE MOMENT",
        "",
        (("                " .. pulse) .. "  ") .. playback,
        "",
        "  NOW PLAYING",
        "  " .. title,
        "  " .. artist,
        "",
        "  " .. bar,
        (("  " .. position) .. "                                                  ") .. duration,
        "",
        "  EQ CURVE",
        "  " .. eqCurve(settings.eq.bands, settings.eq.enabled),
        ("  VOLUME  " .. tostring(math.floor(state.volume + 0.5))) .. "%",
        (((((("  QUEUE  " .. tostring(queue.current + 1)) .. "/") .. tostring(queue.count)) .. "  ·  ") .. shuffle) .. "  ·  repeat ") .. ____repeat,
        "",
        "  [p] play/pause    [n] next    [b] back    [Q] queue    [/] search",
        "  [j] JioSaavn      [v] spectrum    [f] filter    [e] equalizer",
        "  [r] local files   [s] shuffle    [R] repeat   [-][+] volume   [q] close"
    }
end
local function draw()
    if state.buffer == 0 or not vim.api.nvim_buf_is_valid(state.buffer) then
        stopTimer()
        return
    end
    local lines = buildLines()
    vim.bo[state.buffer].modifiable = true
    vim.api.nvim_buf_set_lines(
        state.buffer,
        0,
        -1,
        false,
        lines
    )
    vim.bo[state.buffer].modifiable = false
    vim.api.nvim_buf_clear_namespace(state.buffer, namespace, 0, -1)
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerEyebrow",
        0,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerAccent",
        2,
        16,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerEyebrow",
        4,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerTitle",
        5,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        6,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerBar",
        8,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        9,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerEyebrow",
        11,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerAccent",
        12,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        13,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        14,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        15,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        17,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        18,
        0,
        -1
    )
    vim.api.nvim_buf_add_highlight(
        state.buffer,
        namespace,
        "PlayerMuted",
        19,
        0,
        -1
    )
end
local function onProperty(value)
    if type(value) == "string" and value ~= "" then
        state.title = value
        draw()
    end
end
local function onArtist(value)
    if type(value) == "string" and value ~= "" then
        state.artist = value
        draw()
    end
end
local function onPosition(value)
    if type(value) == "number" then
        state.position = value
        draw()
    end
end
local function onDuration(value)
    if type(value) == "number" then
        state.duration = value
        draw()
    end
end
local function onPause(value)
    state.paused = value == true
    draw()
end
local function onVolume(value)
    if type(value) == "number" then
        state.volume = value
        draw()
    end
end
local function watch()
    stopObservers()
    state.observers[#state.observers + 1] = mpv.observe("media-title", onProperty)
    state.observers[#state.observers + 1] = mpv.observe("metadata/by-key/artist", onArtist)
    state.observers[#state.observers + 1] = mpv.observe("time-pos", onPosition)
    state.observers[#state.observers + 1] = mpv.observe("duration", onDuration)
    state.observers[#state.observers + 1] = mpv.observe("pause", onPause)
    state.observers[#state.observers + 1] = mpv.observe("volume", onVolume)
end
local function resize()
    if state.window == 0 or not vim.api.nvim_win_is_valid(state.window) then
        return
    end
    local width = math.max(
        40,
        math.min(74, vim.o.columns - 8)
    )
    local height = 21
    vim.api.nvim_win_set_config(
        state.window,
        {
            relative = "editor",
            width = width,
            height = height,
            row = math.max(
                1,
                math.floor((vim.o.lines - height) / 2)
            ),
            col = math.max(
                1,
                math.floor((vim.o.columns - width) / 2)
            ),
            border = "rounded",
            title = "  player.nvim  ",
            title_pos = "center"
        }
    )
end
--- Close the dashboard.
function ____exports.close()
    stopTimer()
    stopObservers()
    if state.window ~= 0 and vim.api.nvim_win_is_valid(state.window) then
        vim.api.nvim_win_close(state.window, true)
    end
    state.window = 0
    state.buffer = 0
end
--- Open (or focus) the dashboard.
function ____exports.open()
    ____exports.close()
    setStyle()
    local width = math.max(
        40,
        math.min(74, vim.o.columns - 8)
    )
    local height = 21
    state.buffer = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_name(
        state.buffer,
        "player://dashboard-" .. tostring(vim.uv.hrtime())
    )
    vim.bo[state.buffer].buftype = "nofile"
    vim.bo[state.buffer].bufhidden = "wipe"
    vim.bo[state.buffer].swapfile = false
    vim.bo[state.buffer].filetype = "playerdashboard"
    draw()
    state.window = vim.api.nvim_open_win(
        state.buffer,
        true,
        {
            relative = "editor",
            width = width,
            height = height,
            row = math.max(
                1,
                math.floor((vim.o.lines - height) / 2)
            ),
            col = math.max(
                1,
                math.floor((vim.o.columns - width) / 2)
            ),
            style = "minimal",
            border = "rounded",
            title = "  player.nvim  ",
            title_pos = "center"
        }
    )
    vim.wo[state.window].winhighlight = "Normal:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow"
    vim.wo[state.window].wrap = false
    local buffer = state.buffer
    local function map(key, action, description)
        vim.keymap.set("n", key, action, {buffer = buffer, silent = true, desc = description})
    end
    local player = actions()
    map(
        "q",
        function()
            ____exports.close()
        end,
        "Close player dashboard"
    )
    map(
        "<Esc>",
        function()
            ____exports.close()
        end,
        "Close player dashboard"
    )
    map("p", player.toggle_pause, "Toggle playback")
    map("n", player.play_next, "Next track")
    map("b", player.play_previous, "Previous track")
    map("l", player.show_lyrics, "Open lyrics")
    map("/", player.search_lyrics, "Search lyrics")
    map("j", player.search_jiosaavn, "Search JioSaavn")
    map("v", player.toggle_visualizer, "Toggle spectrum window")
    map("f", player.configure_filter, "Configure filter")
    map("e", player.configure_eq, "Configure equalizer")
    map("Q", player.show_queue, "Browse player queue")
    map("s", player.toggle_shuffle, "Toggle queue shuffle")
    map("R", player.cycle_repeat, "Cycle repeat mode")
    map(
        "r",
        function()
            ____exports.close()
            player.pick_local()
        end,
        "Pick local audio"
    )
    map("-", player.volume_down, "Lower volume")
    map("+", player.volume_up, "Raise volume")
    state.timer = vim.uv.new_timer()
    state.timer.start(
        state.timer,
        0,
        400,
        function()
            state.frame = state.frame + 1
            draw()
        end
    )
    watch()
    mpv.getVolume(function(volume)
        state.volume = volume
        draw()
    end)
end
--- Redraw the dashboard when the terminal was resized.
function ____exports.onResize()
    resize()
    draw()
end
return ____exports
