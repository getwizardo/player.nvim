--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
--- The name of the player module, kept in a variable so that it is not rewritten.
local moduleName = "player"
--- Load the player module.
local function playerModule()
    return require(moduleName)
end
--- Register every command of the plugin.
local function register()
    vim.api.nvim_create_user_command(
        "Player",
        function(opts)
            playerModule().open(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "?", desc = "Open the player dashboard or play a source"}
    )
    vim.api.nvim_create_user_command(
        "PlayerPlay",
        function(opts)
            if opts.args == "" then
                playerModule().pickLocal()
            else
                playerModule().play(opts.args)
            end
        end,
        {nargs = "?", complete = "file", desc = "Play a local file or a streaming URL"}
    )
    vim.api.nvim_create_user_command(
        "PlayerPause",
        function()
            playerModule().pause()
        end,
        {desc = "Toggle playback"}
    )
    vim.api.nvim_create_user_command(
        "PlayerStop",
        function()
            playerModule().stop()
        end,
        {desc = "Stop playback"}
    )
    vim.api.nvim_create_user_command(
        "PlayerNext",
        function()
            playerModule().next()
        end,
        {desc = "Play the next queued track"}
    )
    vim.api.nvim_create_user_command(
        "PlayerPrev",
        function()
            playerModule().previous()
        end,
        {desc = "Play the previous queued track"}
    )
    vim.api.nvim_create_user_command(
        "PlayerSeek",
        function(opts)
            if opts.args == "" then
                playerModule().seek(0)
                return
            end
            local seconds = tonumber(opts.args)
            if seconds == nil then
                vim.notify("The seek command expects a number of seconds.", vim.log.levels.ERROR, {title = "player.nvim"})
                return
            end
            playerModule().seek(seconds)
        end,
        {nargs = "?", desc = "Seek to a position in seconds"}
    )
    vim.api.nvim_create_user_command(
        "PlayerVolume",
        function(opts)
            if opts.args == "" then
                playerModule().status()
                return
            end
            local delta = tonumber(opts.args)
            if delta == nil then
                vim.notify("The volume command expects a number of steps.", vim.log.levels.ERROR, {title = "player.nvim"})
                return
            end
            playerModule().volume(delta)
        end,
        {nargs = "?", desc = "Change the volume by a number of steps"}
    )
    vim.api.nvim_create_user_command(
        "PlayerQueue",
        function()
            playerModule().pickLocal(true)
        end,
        {desc = "Pick a local file and add it to the queue"}
    )
    vim.api.nvim_create_user_command(
        "PlayerQueueAdd",
        function(opts)
            if opts.args == "" then
                playerModule().pickLocal(true)
            else
                playerModule().queueAdd(opts.args)
            end
        end,
        {nargs = "?", complete = "file", desc = "Add a file or URL to the queue"}
    )
    vim.api.nvim_create_user_command(
        "PlayerQueueList",
        function()
            playerModule().queueList()
        end,
        {desc = "Browse the queue and play a track"}
    )
    vim.api.nvim_create_user_command(
        "PlayerQueueClear",
        function()
            playerModule().queueClear()
        end,
        {desc = "Stop playback and clear the queue"}
    )
    vim.api.nvim_create_user_command(
        "PlayerQueueRemove",
        function(opts)
            local index = tonumber(opts.args)
            if index == nil then
                vim.notify("The command expects the position of a track in the queue.", vim.log.levels.ERROR, {title = "player.nvim"})
                return
            end
            playerModule().queueRemove(index - 1)
        end,
        {nargs = "?", desc = "Remove a track from the queue"}
    )
    vim.api.nvim_create_user_command(
        "PlayerShuffle",
        function(opts)
            if opts.args == "on" then
                playerModule().toggleShuffle(true)
            elseif opts.args == "off" then
                playerModule().toggleShuffle(false)
            elseif opts.args == "" then
                playerModule().toggleShuffle()
            else
                vim.notify("Use :PlayerShuffle [on|off]", vim.log.levels.ERROR, {title = "player.nvim"})
            end
        end,
        {
            nargs = "?",
            complete = function()
                return {"on", "off"}
            end,
            desc = "Toggle the queue shuffle"
        }
    )
    vim.api.nvim_create_user_command(
        "PlayerRepeat",
        function(opts)
            playerModule().cycleRepeat(opts.args ~= "" and opts.args or nil)
        end,
        {
            nargs = "?",
            complete = function()
                return {"off", "queue", "track"}
            end,
            desc = "Cycle or set the repeat mode"
        }
    )
    vim.api.nvim_create_user_command(
        "PlayerSearch",
        function(opts)
            playerModule().search(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "*", desc = "Search the track services with yt-dlp and the JioSaavn catalog"}
    )
    vim.api.nvim_create_user_command(
        "PlayerDownload",
        function(opts)
            playerModule().download(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "?", desc = "Download audio with yt-dlp"}
    )
    vim.api.nvim_create_user_command(
        "PlayerEQ",
        function(opts)
            playerModule().eq(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "?", desc = "Configure the player equalizer"}
    )
    vim.api.nvim_create_user_command(
        "PlayerFilter",
        function(opts)
            playerModule().filter(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "?", desc = "Configure the audio filter"}
    )
    vim.api.nvim_create_user_command(
        "PlayerLyrics",
        function(opts)
            playerModule().showLyrics(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "?", desc = "Fetch the lyrics from lrc.red by ISRC"}
    )
    vim.api.nvim_create_user_command(
        "PlayerLyricsSearch",
        function(opts)
            playerModule().searchLyrics(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "*", desc = "Search the lyrics on LRCLIB, MusicBrainz and the JioSaavn catalog"}
    )
    vim.api.nvim_create_user_command(
        "PlayerTranslate",
        function(opts)
            playerModule().translateLyrics(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "?", desc = "Translate the open karaoke lyrics"}
    )
    vim.api.nvim_create_user_command(
        "PlayerJioSaavn",
        function(opts)
            playerModule().searchJioSaavn(opts.args ~= "" and opts.args or nil)
        end,
        {nargs = "*", desc = "Search and play JioSaavn results"}
    )
    vim.api.nvim_create_user_command(
        "PlayerVisualize",
        function()
            playerModule().visualize()
        end,
        {desc = "Toggle the live audio spectrum window of mpv"}
    )
    vim.api.nvim_create_user_command(
        "PlayerStatus",
        function()
            playerModule().status()
        end,
        {desc = "Show the player status"}
    )
    vim.api.nvim_create_user_command(
        "PlayerQuit",
        function()
            playerModule().shutdown()
        end,
        {desc = "Stop the mpv process"}
    )
    vim.api.nvim_create_autocmd(
        "VimLeavePre",
        {
            group = vim.api.nvim_create_augroup("player_nvim_lifecycle", {clear = true}),
            callback = function()
                playerModule().shutdown()
            end
        }
    )
end
if vim.g.loaded_player_nvim ~= true then
    vim.g.loaded_player_nvim = true
    register()
end
return ____exports
