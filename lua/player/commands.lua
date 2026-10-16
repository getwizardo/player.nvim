local ____exports = {}
local ____config = require("player.config")
local getOptions = ____config.get
local init = require("player.init")
local karaoke = require("player.karaoke")
local ui = require("player.ui")
local ____util = require("player.util")
local replace = ____util.replace
local trim = ____util.trim
local warn = ____util.warn
local registered = false
--- Boot with defaults (or `vim.g.player_nvim`) unless the user ran setup().
local function boot()
    if init.isConfigured() then
        return
    end
    init.setup(vim.g.player_nvim)
end
local function define(name, fn, opts)
    vim.api.nvim_create_user_command(
        name,
        function(args)
            boot()
            fn(args)
        end,
        opts
    )
end
--- Join `:Command arg1 arg2 …` back into one string.
local function words(args)
    return trim(table.concat(args.fargs, " "))
end
--- Bind the global keymaps.
-- 
-- `<Leader>` is resolved here rather than by Neovim so the maps keep working
-- even when `vim.g.mapleader` is set after this plugin has loaded. An empty
-- string disables a binding.
local function defineKeymaps()
    local keys = getOptions().keymaps
    local configured = vim.g.mapleader
    local leader = (configured == nil or configured == "") and "\\" or configured
    local function map(lhs, rhs, description)
        local target = trim(lhs)
        if target == "" then
            return
        end
        local expanded = replace(
            replace(target, "<[Ll]eader>", leader),
            "<leader>",
            leader
        )
        vim.keymap.set("n", expanded, rhs, {silent = true, desc = description})
    end
    map(
        keys.play_pause,
        function()
            if not ui.isOpen() and not karaoke.isOpen() then
                ui.open()
                return
            end
            init.togglePlay()
        end,
        "player: play/pause (open the dashboard when idle)"
    )
    map(
        keys.next,
        function() return init.next() end,
        "player: next track"
    )
    map(
        keys.previous,
        function() return init.previous() end,
        "player: previous track"
    )
    map(
        keys.lyrics,
        function() return init.lyricsForCurrent() end,
        "player: lyrics for the current track"
    )
end
--- Create every `:Player*` command. Safe to call more than once.
function ____exports.register()
    if registered then
        return
    end
    registered = true
    boot()
    define(
        "Player",
        function(args)
            local query = words(args)
            if query == "" then
                ui.open()
                return
            end
            init.searchTracks(query)
        end,
        {nargs = "*", desc = "Open the player dashboard, or search every enabled source"}
    )
    define(
        "PlayerSearch",
        function(args) return init.searchTracks(words(args)) end,
        {nargs = "+", desc = "Search every enabled music source"}
    )
    define(
        "PlayerUrl",
        function(args) return init.playUrl(args.fargs[1] or "") end,
        {nargs = 1, desc = "Play a URL or local file directly"}
    )
    define(
        "PlayerNext",
        function() return init.next() end,
        {desc = "Next track in the queue"}
    )
    define(
        "PlayerPrev",
        function() return init.previous() end,
        {desc = "Previous track in the queue"}
    )
    define(
        "PlayerToggle",
        function() return init.togglePlay() end,
        {desc = "Play / pause"}
    )
    define(
        "PlayerStop",
        function() return init.stop() end,
        {desc = "Stop playback"}
    )
    define(
        "PlayerSeek",
        function(args)
            local seconds = tonumber(args.fargs[1] or "")
            if seconds == nil then
                warn(":PlayerSeek needs a number of seconds, e.g. :PlayerSeek -15")
                return
            end
            init.seekRelative(seconds)
        end,
        {nargs = 1, desc = "Seek by N seconds (negative to rewind)"}
    )
    define(
        "PlayerVolume",
        function(args)
            local raw = trim(args.fargs[1] or "")
            if raw == "" then
                init.nudgeVolume(0)
                return
            end
            local level = tonumber(raw)
            if level == nil then
                warn(":PlayerVolume needs a number, e.g. :PlayerVolume 60")
                return
            end
            init.setVolume(level)
        end,
        {nargs = "?", desc = "Show or set the volume (0-130)"}
    )
    define(
        "PlayerVisual",
        function() return init.toggleVisualizer() end,
        {desc = "Toggle the audio visualizer"}
    )
    define(
        "PlayerDownload",
        function() return init.downloadSelection() end,
        {desc = "Download the selected result with yt-dlp"}
    )
    define(
        "PlayerStatus",
        function() return init.status() end,
        {desc = "Show playback, queue and diagnostics"}
    )
    define(
        "PlayerSources",
        function() return init.sources() end,
        {desc = "List the configured music and lyric sources"}
    )
    define(
        "PlayerLyrics",
        function(args)
            local query = words(args)
            if query == "" then
                init.lyricsForCurrent()
                return
            end
            init.lyricsSearch(query)
        end,
        {nargs = "*", desc = "Lyrics for the current track, or search by query"}
    )
    define(
        "PlayerLyricsSearch",
        function(args) return init.lyricsSearch(words(args)) end,
        {nargs = "+", desc = "Search lrc.red / LRCLIB / JioSaavn for lyrics"}
    )
    define(
        "PlayerLyricsIsrc",
        function(args) return init.lyricsByIsrc(args.fargs[1] or "") end,
        {nargs = 1, desc = "Fetch lrc.red word-synced lyrics by ISRC"}
    )
    define(
        "PlayerTranslate",
        function(args)
            local target = trim(args.fargs[1] or "")
            local ____init_translateLyrics_1 = init.translateLyrics
            local ____temp_0
            if target == "" then
                ____temp_0 = nil
            else
                ____temp_0 = target
            end
            ____init_translateLyrics_1(____temp_0)
        end,
        {nargs = "?", desc = "Translate the open lyrics"}
    )
    define(
        "PlayerKaraoke",
        function()
            if karaoke.isOpen() then
                karaoke.close()
                return
            end
            init.lyricsForCurrent()
        end,
        {desc = "Toggle the karaoke float for the current track"}
    )
    define(
        "PlayerClose",
        function() return init.close() end,
        {desc = "Close every player float (playback continues)"}
    )
    define(
        "PlayerDiagnostics",
        function() return init.diagnostics() end,
        {desc = "Show mpv's own output — useful when a track will not play"}
    )
    define(
        "PlayerDoctor",
        function() return init.doctor() end,
        {desc = "Check curl, mpv, yt-dlp and the lyric services"}
    )
    defineKeymaps()
end
return ____exports
