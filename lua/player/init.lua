--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local notify, playIndex, MEDIA_EXTENSIONS
local ____actions = require("player.actions")
local setActions = ____actions.setActions
local ____config = require("player.config")
local applyOptions = ____config.setup
local isFilterType = ____config.isFilterType
local isRepeatMode = ____config.isRepeatMode
local options = ____config.options
local ____format = require("player.format")
local formatClock = ____format.formatClock
local sourceLabel = ____format.sourceLabel
local ____helper = require("player.helper")
local helperCall = ____helper.helperCall
local ____lua_2Dutil = require("player.lua-util")
local attempt = ____lua_2Dutil.attempt
local indexOf = ____lua_2Dutil.indexOf
local matchCapture = ____lua_2Dutil.matchCapture
local push = ____lua_2Dutil.push
local split = ____lua_2Dutil.split
local lyrics = require("player.lyrics")
local mpv = require("player.mpv")
local queue = require("player.queue")
local ui = require("player.ui")
function notify(message, level)
    vim.notify(message, level == nil and vim.log.levels.INFO or level, {title = "player.nvim"})
end
--- Resolve a source into something mpv can play.
-- 
-- Local files are expanded (`~`, relative paths) and URLs are accepted as
-- they are. Anything that could be mistaken for a command line option is
-- rejected.
function ____exports.resolveSource(source)
    if type(source) ~= "string" or source == "" then
        return nil
    end
    local trimmed = string.gsub(source, "^%s*(.-)%s*$", "%1")
    if trimmed == "" or string.sub(trimmed, 1, 1) == "-" then
        return nil
    end
    if string.find(trimmed, "^[%a][%w+.-]*://") ~= nil then
        return trimmed
    end
    local expanded = vim.fn.expand(trimmed)
    if vim.fn.filereadable(expanded) == 1 then
        return vim.fn.fnamemodify(expanded, ":p")
    end
    return nil
end
function playIndex(index, fromHistory)
    local state = queue.state()
    if index < 0 or index >= #state.items then
        return
    end
    if state.current >= 0 and state.current ~= index and not fromHistory then
        queue.recordHistory(state, state.current)
    end
    state.current = index
    mpv.play(state.items[index + 1].source)
    notify("Playing " .. state.items[index + 1].label)
end
--- Start playback of a local file or URL.
function ____exports.play(source)
    local resolved = ____exports.resolveSource(source)
    if resolved == nil then
        notify(
            "Not a readable local file or a URL: " .. tostring(source),
            vim.log.levels.ERROR
        )
        return
    end
    if string.find(resolved, "^[%a][%w+.-]*://") == nil and vim.fn.getfsize(resolved) == 0 then
        notify("That file is empty: " .. resolved, vim.log.levels.ERROR)
        return
    end
    local state = queue.state()
    queue.clearQueue(state)
    queue.addItem(state, resolved)
    playIndex(0, false)
end
--- True when the URL points to a media file that mpv can play directly.
function ____exports.isDirectMedia(url)
    local withoutQuery = string.gsub(url, "[?#].*$", "")
    local extension = matchCapture(withoutQuery, "%.([%w]+)$")
    if extension == nil then
        return false
    end
    return indexOf(
        MEDIA_EXTENSIONS,
        string.lower(extension)
    ) >= 0
end
--- Ask yt-dlp for the direct media URL of a page.
-- 
-- The catalog services return links to a web page; mpv needs the media URL
-- itself, so the link is resolved with yt-dlp before it is played.
function ____exports.resolveWithYtDlp(url, callback)
    if vim.fn.executable(options().yt_dlp) ~= 1 then
        callback(nil, "yt-dlp is not installed.")
        return
    end
    local args = {
        options().yt_dlp,
        "--no-warnings",
        "--no-playlist",
        "--get-url",
        url
    }
    vim.system(
        args,
        {text = true},
        function(result)
            vim.schedule(function()
                if result.code ~= 0 then
                    callback(nil, result.stderr ~= "" and result.stderr or "yt-dlp could not resolve that link.")
                    return
                end
                local lines = split(result.stdout, "\n")
                do
                    local index = 0
                    while index < #lines do
                        local line = string.gsub(lines[index + 1], "^%s*(.-)%s*$", "%1")
                        if line ~= "" then
                            callback(line)
                            return
                        end
                        index = index + 1
                    end
                end
                callback(nil, "yt-dlp did not return a media URL.")
            end)
        end
    )
end
--- Play a URL that was picked in a search result.
-- 
-- Direct media files are handed to mpv as they are; a link to a web page is
-- resolved with yt-dlp first, so that the catalog results can be played too.
function ____exports.playUrl(url)
    if url == "" then
        return
    end
    if ____exports.isDirectMedia(url) then
        ____exports.play(url)
        return
    end
    ____exports.resolveWithYtDlp(
        url,
        function(resolved, ____error)
            if resolved == nil then
                notify(
                    "Could not play that result: " .. tostring(____error),
                    vim.log.levels.ERROR
                )
                return
            end
            ____exports.play(resolved)
        end
    )
end
--- Add several sources to the queue and start playing when nothing plays.
function ____exports.addToQueue(sources)
    local state = queue.state()
    local added = 0
    do
        local index = 0
        while index < #sources do
            local resolved = ____exports.resolveSource(sources[index + 1])
            if resolved ~= nil then
                queue.addItem(state, resolved)
                added = added + 1
            end
            index = index + 1
        end
    end
    if added == 0 then
        notify("No playable files selected.", vim.log.levels.WARN)
        return
    end
    notify(("Added " .. tostring(added)) .. " track(s) to the queue.")
    if state.current < 0 then
        playIndex(#state.items - added, false)
    end
end
local function parseSearchResults(text)
    local entries = {}
    local decoded = attempt(function()
        return vim.json.decode(text)
    end)
    if not decoded.ok or decoded.value == nil or type(decoded.value) ~= "table" then
        return entries
    end
    local payload = decoded.value
    local list = payload.entries
    if type(list) ~= "table" then
        return entries
    end
    local items = list
    do
        local index = 0
        while index < #items do
            do
                local __continue25
                repeat
                    local item = items[index + 1]
                    if type(item) ~= "table" then
                        __continue25 = true
                        break
                    end
                    local record = item
                    local url = ""
                    if type(record.webpage_url) == "string" then
                        url = record.webpage_url
                    elseif type(record.original_url) == "string" then
                        url = record.original_url
                    elseif type(record.url) == "string" then
                        url = record.url
                    elseif type(record.id) == "string" then
                        url = "https://www.youtube.com/watch?v=" .. record.id
                    end
                    if url == "" then
                        __continue25 = true
                        break
                    end
                    local entry = {
                        title = type(record.title) == "string" and record.title or (type(record.fulltitle) == "string" and record.fulltitle or "Untitled"),
                        uploader = type(record.uploader) == "string" and record.uploader or (type(record.channel) == "string" and record.channel or ""),
                        url = url,
                        provider = "yt-dlp"
                    }
                    if type(record.duration) == "number" then
                        entry.duration = record.duration
                    end
                    entries[#entries + 1] = entry
                    __continue25 = true
                until true
                if not __continue25 then
                    break
                end
            end
            index = index + 1
        end
    end
    return entries
end
--- Turn an answer of the helper into a list of records.
local function toRecords(value)
    if type(value) ~= "table" then
        return {}
    end
    local records = {}
    local source = value
    do
        local index = 0
        while index < #source do
            local entry = source[index + 1]
            if type(entry) == "table" then
                records[#records + 1] = entry
            end
            index = index + 1
        end
    end
    return records
end
local function loadModule(name)
    local loaded = attempt(function()
        return require(name)
    end)
    if not loaded.ok or loaded.value == nil then
        return nil
    end
    return loaded.value
end
--- Pick a local audio file, optionally adding it to the queue.
function ____exports.pickLocal(append)
    local add = append == true
    if options().use_telescope then
        local pickers = loadModule("telescope.pickers")
        local finders = loadModule("telescope.finders")
        local conf = loadModule("telescope.config")
        local telescopeActions = loadModule("telescope.actions")
        local actionState = loadModule("telescope.actions.state")
        if pickers ~= nil and finders ~= nil and conf ~= nil and telescopeActions ~= nil and actionState ~= nil then
            local cwd = vim.fn.getcwd()
            local hasFd = vim.fn.executable("fd") == 1
            local command = hasFd and ({
                "fd",
                "--type",
                "f",
                "--hidden",
                "--exclude",
                ".git"
            }) or ({"find", ".", "-type", "f"})
            pickers.new(
                {},
                {
                    prompt_title = add and "Queue local audio" or "Play local audio",
                    finder = finders.new_oneshot_job(command, {cwd = cwd}),
                    sorter = conf.values.file_sorter({}),
                    attach_mappings = function(_promptBuffer, map)
                        local function select(enqueue)
                            local selection = actionState.get_selected_entry()
                            telescopeActions.close(_promptBuffer)
                            if selection ~= nil then
                                local path = (cwd .. "/") .. selection.value
                                if enqueue then
                                    ____exports.addToQueue({path})
                                else
                                    ____exports.play(path)
                                end
                            end
                        end
                        map(
                            "i",
                            "<CR>",
                            function()
                                select(add)
                            end
                        )
                        map(
                            "n",
                            "<CR>",
                            function()
                                select(add)
                            end
                        )
                        if not add then
                            map(
                                "i",
                                "<C-q>",
                                function()
                                    select(true)
                                end
                            )
                            map(
                                "n",
                                "<C-q>",
                                function()
                                    select(true)
                                end
                            )
                        end
                        return true
                    end
                }
            ).find()
            return
        end
    end
    local files = vim.fn.globpath(
        vim.fn.getcwd(),
        "**/*",
        false,
        true
    )
    local audio = {}
    local supported = {
        mp3 = true,
        m4a = true,
        aac = true,
        flac = true,
        wav = true,
        ogg = true,
        opus = true,
        wma = true,
        aiff = true,
        ape = true,
        alac = true,
        mp4 = true,
        webm = true,
        mkv = true
    }
    do
        local index = 0
        while index < #files and #audio < 500 do
            local path = files[index + 1]
            local extension = matchCapture(path, "%.([%w]+)$")
            if extension ~= nil and supported[string.lower(extension)] == true and vim.fn.filereadable(path) == 1 then
                audio[#audio + 1] = path
            end
            index = index + 1
        end
    end
    if #audio == 0 then
        notify("No audio files were found in the current working directory.", vim.log.levels.WARN)
        return
    end
    vim.ui.select(
        audio,
        {prompt = add and "Queue local audio" or "Play local audio"},
        function(path)
            if type(path) == "string" and path ~= "" then
                if add then
                    ____exports.addToQueue({path})
                else
                    ____exports.play(path)
                end
            end
        end
    )
end
--- Add a file or URL to the queue.
function ____exports.queueAdd(source)
    local resolved = ____exports.resolveSource(source)
    if resolved == nil then
        notify(
            "Not a readable local file or a URL: " .. tostring(source),
            vim.log.levels.ERROR
        )
        return
    end
    ____exports.addToQueue({resolved})
end
--- Remove a track from the queue.
function ____exports.queueRemove(index)
    local state = queue.state()
    if not queue.removeItem(state, index) then
        notify("There is no track at that position.", vim.log.levels.WARN)
        return
    end
    notify("Removed the track from the queue.")
end
--- Show the queue and play the selected track.
function ____exports.queueList()
    local state = queue.state()
    if #state.items == 0 then
        notify("The player queue is empty.", vim.log.levels.WARN)
        return
    end
    local items = {}
    do
        local index = 0
        while index < #state.items do
            local marker = index == state.current and "▶" or " "
            items[#items + 1] = string.format("%s %02d. %s", marker, index + 1, state.items[index + 1].label)
            index = index + 1
        end
    end
    vim.ui.select(
        items,
        {prompt = ("Player queue · " .. tostring(#state.items)) .. " track(s)"},
        function(_item, index)
            if type(index) == "number" and index >= 0 then
                playIndex(index, false)
            end
        end
    )
end
--- Stop playback and clear the queue.
function ____exports.queueClear()
    local state = queue.state()
    queue.clearQueue(state)
    if mpv.isAlive() then
        mpv.stop()
    end
    notify("Queue cleared.")
end
--- Turn shuffle on or off.
function ____exports.toggleShuffle(enabled)
    local state = queue.state()
    local ____temp_0
    if enabled == nil then
        ____temp_0 = not state.shuffle
    else
        ____temp_0 = enabled == true
    end
    local wanted = ____temp_0
    queue.setShuffle(state, wanted)
    notify(("Shuffle " .. (state.shuffle and "on" or "off")) .. ".")
    return state.shuffle
end
--- Set or cycle the repeat mode.
function ____exports.cycleRepeat(mode)
    local state = queue.state()
    if mode ~= nil and mode ~= "" and not isRepeatMode(mode) then
        notify("Repeat mode must be off, queue, or track.", vim.log.levels.ERROR)
        return state["repeat"]
    end
    local result = queue.cycleRepeat(state, mode)
    notify(("Repeat " .. result) .. ".")
    return result
end
--- Toggle the pause state.
function ____exports.pause()
    mpv.pause()
end
--- Stop playback.
function ____exports.stop()
    mpv.stop()
end
--- Play the next track of the queue.
function ____exports.next()
    local state = queue.state()
    local index = queue.nextIndex(
        state,
        function()
            return math.random()
        end
    )
    if index == nil then
        notify("End of queue.", vim.log.levels.WARN)
        return
    end
    playIndex(index, false)
end
--- Play the previous track, or restart the current one.
function ____exports.previous()
    local state = queue.state()
    local index = queue.previousIndex(state)
    if index == nil then
        if state.current >= 0 then
            mpv.seek(0)
        else
            notify("Nothing is playing.", vim.log.levels.WARN)
        end
        return
    end
    playIndex(index, true)
end
--- Seek to an absolute position in seconds.
function ____exports.seek(seconds)
    mpv.seek(seconds)
end
--- Change the volume by a delta.
function ____exports.volume(delta)
    mpv.getVolume(function(current)
        local target = current + (delta == nil and 0 or delta)
        if target < 0 then
            target = 0
        end
        if target > 100 then
            target = 100
        end
        mpv.setVolume(target)
        notify(("Volume " .. tostring(math.floor(target + 0.5))) .. "%.")
    end)
end
--- Show what the player is doing.
function ____exports.status()
    local state = queue.state()
    if not mpv.isAlive() then
        notify(("The player is stopped. Queue: " .. tostring(#state.items)) .. " track(s).")
        return
    end
    mpv.property(
        "media-title",
        function(title)
            mpv.property(
                "time-pos",
                function(position)
                    mpv.property(
                        "duration",
                        function(duration)
                            local name = type(title) == "string" and title ~= "" and title or "Playing"
                            local time = type(position) == "number" and formatClock(position) or "--:--"
                            local total = type(duration) == "number" and formatClock(duration) or "--:--"
                            notify((((((((((name .. "  ") .. time) .. "/") .. total) .. "  ·  ") .. tostring(#state.items)) .. " queued  ·  ") .. (state.shuffle and "shuffle" or "ordered")) .. "  ·  repeat ") .. state["repeat"])
                        end
                    )
                end
            )
        end
    )
end
MEDIA_EXTENSIONS = {
    "mp3",
    "m4a",
    "aac",
    "flac",
    "wav",
    "ogg",
    "oga",
    "opus",
    "wma",
    "aiff",
    "aif",
    "ape",
    "alac",
    "mp4",
    "m4v",
    "webm",
    "mkv",
    "mov",
    "mka"
}
--- Search the track services and play the selected result.
function ____exports.search(query)
    local function run(term)
        if vim.fn.executable(options().yt_dlp) ~= 1 then
            notify("yt-dlp is required for search.", vim.log.levels.ERROR)
            return
        end
        notify("Searching yt-dlp, iTunes and the JioSaavn catalog…")
        local entries = {}
        local pending = 2
        local failure = ""
        local function finish()
            pending = pending - 1
            if pending > 0 then
                return
            end
            if #entries == 0 then
                notify(failure ~= "" and failure or "No search results.", vim.log.levels.WARN)
                return
            end
            vim.ui.select(
                entries,
                {
                    prompt = "Search results · yt-dlp + iTunes + JioSaavn",
                    format_item = function(item)
                        local entry = item
                        local suffix = ""
                        if entry.duration ~= nil then
                            suffix = string.format(
                                " [%d:%02d]",
                                math.floor(entry.duration / 60),
                                math.floor(entry.duration % 60)
                            )
                        end
                        return (((("[" .. entry.provider) .. "] ") .. entry.title) .. (entry.uploader == "" and "" or " — " .. entry.uploader)) .. suffix
                    end
                },
                function(item)
                    if item == nil or item == nil then
                        return
                    end
                    local entry = item
                    ____exports.playUrl(entry.url)
                end
            )
        end
        local args = {
            options().yt_dlp,
            "--flat-playlist",
            "--dump-single-json",
            "--no-warnings",
            "ytsearch10:" .. term
        }
        vim.system(
            args,
            {text = true},
            function(result)
                vim.schedule(function()
                    if result.code ~= 0 then
                        failure = result.stderr ~= "" and result.stderr or "The yt-dlp search failed."
                    else
                        local found = parseSearchResults(result.stdout)
                        do
                            local index = 0
                            while index < #found do
                                push(entries, found[index + 1])
                                index = index + 1
                            end
                        end
                    end
                    finish()
                end)
            end
        )
        helperCall(
            {"tracks", term},
            nil,
            function(value, ____error)
                if ____error ~= nil then
                    failure = failure == "" and ____error or failure
                end
                local songs = toRecords(value)
                do
                    local index = 0
                    while index < #songs do
                        do
                            local __continue125
                            repeat
                                local song = songs[index + 1]
                                local url = song.url
                                if type(url) ~= "string" or url == "" then
                                    __continue125 = true
                                    break
                                end
                                local entry = {
                                    title = type(song.title) == "string" and song.title or "Unknown title",
                                    uploader = type(song.artist) == "string" and song.artist or "",
                                    url = url,
                                    provider = type(song.provider) == "string" and song.provider or "catalog"
                                }
                                if type(song.duration) == "number" then
                                    entry.duration = song.duration
                                end
                                push(entries, entry)
                                __continue125 = true
                            until true
                            if not __continue125 then
                                break
                            end
                        end
                        index = index + 1
                    end
                end
                finish()
            end,
            {PLAYER_JIOSAAVN_API = options().jiosaavn_api},
            30000
        )
    end
    if query ~= nil and query ~= "" then
        run(query)
        return
    end
    vim.ui.input(
        {prompt = "Search tracks via yt-dlp and the JioSaavn catalog: "},
        function(answer)
            if answer ~= nil and answer ~= "" then
                run(answer)
            end
        end
    )
end
--- Download the audio of an HTTP(S) URL with yt-dlp.
function ____exports.download(url)
    local function run(target)
        if string.find(target, "^https?://") == nil then
            notify("The download command expects an http(s) URL.", vim.log.levels.ERROR)
            return
        end
        if vim.fn.executable(options().yt_dlp) ~= 1 then
            notify("yt-dlp is required for downloads.", vim.log.levels.ERROR)
            return
        end
        local directory = options().download_dir
        vim.fn.mkdir(directory, "p")
        local args = {
            options().yt_dlp,
            "--extract-audio",
            "--audio-format",
            "best",
            "--no-playlist",
            "--no-mtime",
            "--output",
            "%(title)s.%(ext)s",
            "--paths",
            directory,
            target
        }
        vim.system(
            args,
            {text = true},
            function(result)
                vim.schedule(function()
                    if result.code == 0 then
                        notify("Download complete: " .. directory)
                    else
                        notify(result.stderr ~= "" and result.stderr or "The download failed.", vim.log.levels.ERROR)
                    end
                end)
            end
        )
    end
    if url ~= nil and url ~= "" then
        run(url)
        return
    end
    vim.ui.input(
        {prompt = "URL to download audio from: "},
        function(answer)
            if answer ~= nil and answer ~= "" then
                run(answer)
            end
        end
    )
end
--- Configure the ten band equalizer.
function ____exports.eq(argument)
    local settings = options()
    if argument == "off" then
        settings.eq.enabled = false
        mpv.applyAudio()
        notify("The equalizer is disabled.")
        return
    end
    if argument == "on" then
        settings.eq.enabled = true
        mpv.applyAudio()
        notify("The equalizer is enabled.")
        return
    end
    local current = {}
    do
        local index = 0
        while index < #settings.eq.bands do
            current[#current + 1] = tostring(settings.eq.bands[index + 1])
            index = index + 1
        end
    end
    vim.ui.input(
        {
            prompt = "10 EQ gains in dB, comma-separated (-12 to 12): ",
            default = table.concat(current, ",")
        },
        function(answer)
            if answer == nil then
                return
            end
            local parts = split(answer, ",")
            local gains = {}
            do
                local index = 0
                while index < #parts do
                    local value = tonumber(string.gsub(parts[index + 1], "^%s*(.-)%s*$", "%1"))
                    if value == nil or value < -12 or value > 12 then
                        notify("Every EQ band must be between -12 and 12 dB.", vim.log.levels.ERROR)
                        return
                    end
                    gains[#gains + 1] = value
                    index = index + 1
                end
            end
            if #gains ~= 10 then
                notify("Enter exactly ten comma-separated gains.", vim.log.levels.ERROR)
                return
            end
            settings.eq.bands = gains
            settings.eq.enabled = true
            mpv.applyAudio()
            notify("The custom 10 band equalizer is enabled.")
        end
    )
end
--- Configure the audio filter.
function ____exports.filter(kind)
    local settings = options()
    local function apply(____type)
        if ____type == "off" then
            settings.filter.enabled = false
            settings.filter.type = "off"
            mpv.applyAudio()
            notify("The filter is disabled.")
            return
        end
        if not isFilterType(____type) then
            notify("The filter must be lowpass, highpass, bandpass, or off.", vim.log.levels.ERROR)
            return
        end
        settings.filter.type = ____type
        vim.ui.input(
            {
                prompt = "Filter frequency (Hz): ",
                default = tostring(settings.filter.frequency)
            },
            function(answer)
                if answer == nil then
                    return
                end
                local frequency = tonumber(answer)
                if frequency == nil or frequency < 20 or frequency > 20000 then
                    notify("The frequency must be between 20 and 20000 Hz.", vim.log.levels.ERROR)
                    return
                end
                settings.filter.frequency = math.floor(frequency + 0.5)
                settings.filter.enabled = true
                if ____type == "bandpass" then
                    vim.ui.input(
                        {
                            prompt = "Band-pass Q width: ",
                            default = tostring(settings.filter.width)
                        },
                        function(width)
                            if width == nil then
                                return
                            end
                            local value = tonumber(width)
                            settings.filter.width = value == nil and 1 or value
                            mpv.applyAudio()
                            notify("The band-pass filter is enabled.")
                        end
                    )
                    return
                end
                mpv.applyAudio()
                notify(("The " .. ____type) .. " filter is enabled.")
            end
        )
    end
    if kind ~= nil and kind ~= "" then
        apply(kind)
        return
    end
    local choices = {"off", "lowpass", "highpass", "bandpass"}
    vim.ui.select(
        choices,
        {prompt = "Audio filter"},
        function(choice)
            if type(choice) == "string" then
                apply(choice)
            end
        end
    )
end
--- Show the lyrics of the current track, or of an ISRC.
function ____exports.showLyrics(isrc)
    lyrics.show(isrc)
end
--- Search the lyric catalogs.
function ____exports.searchLyrics(query)
    lyrics.search(query)
end
--- Search the JioSaavn catalog.
function ____exports.searchJioSaavn(query)
    lyrics.searchJioSaavn(query)
end
--- Translate the lyrics that are currently open.
function ____exports.translateLyrics(target)
    lyrics.translate(target)
end
--- Toggle the mpv spectrum window.
function ____exports.visualize(enabled)
    mpv.visualize(enabled)
end
--- Open the dashboard, or play a source.
function ____exports.open(source)
    if source ~= nil and source ~= "" then
        ____exports.play(source)
        return
    end
    ui.open()
end
--- Stop mpv and release every resource.
function ____exports.shutdown()
    mpv.shutdown()
    lyrics.close()
    ui.close()
end
--- The current queue state.
function ____exports.queueInfo()
    local state = queue.state()
    return {count = #state.items, current = state.current + 1, shuffle = state.shuffle, ["repeat"] = state["repeat"]}
end
--- Label of a source, used by the queue browser.
function ____exports.label(source)
    return sourceLabel(source)
end
local function actionTogglePause()
    ____exports.pause()
end
local function actionNext()
    ____exports.next()
end
local function actionPrevious()
    ____exports.previous()
end
local function actionShowLyrics()
    ____exports.showLyrics()
end
local function actionSearchLyrics()
    ____exports.searchLyrics()
end
local function actionSearchJioSaavn()
    ____exports.searchJioSaavn()
end
local function actionVisualize()
    ____exports.visualize()
end
local function actionFilter()
    ____exports.filter()
end
local function actionEq()
    ____exports.eq()
end
local function actionQueueList()
    ____exports.queueList()
end
local function actionToggleShuffle()
    ____exports.toggleShuffle()
end
local function actionCycleRepeat()
    ____exports.cycleRepeat()
end
local function actionPickLocal()
    ____exports.pickLocal()
end
local function actionVolumeDown()
    ____exports.volume(-5)
end
local function actionVolumeUp()
    ____exports.volume(5)
end
local function actionCloseLyrics()
    lyrics.close()
end
local function actionTranslateLyrics()
    ____exports.translateLyrics()
end
local function actionToggleFollow()
    local current = options()
    current.lyric.follow = not current.lyric.follow
    notify(("Karaoke follow " .. (current.lyric.follow and "on" or "off")) .. ".")
end
local function actionPlayUrl(url)
    ____exports.play(url)
end
local function onEndFile(payload)
    if type(payload) ~= "table" then
        return
    end
    local message = payload
    local reason = message.reason
    if reason ~= "eof" then
        if reason == "error" then
            notify("mpv could not play the file.", vim.log.levels.ERROR)
        end
        return
    end
    local state = queue.state()
    if state["repeat"] == "track" and state.current >= 0 then
        playIndex(state.current, true)
        return
    end
    local index = queue.nextIndex(
        state,
        function()
            return math.random()
        end
    )
    if index == nil then
        notify("The queue finished.", vim.log.levels.INFO)
        return
    end
    playIndex(index, false)
end
mpv.on("end-file", onEndFile)
mpv.on(
    "file-load-failed",
    function(payload)
        local message = payload
        local reason = type(message.reason) == "string" and message.reason or "unknown error"
        notify("mpv could not load the file: " .. reason, vim.log.levels.ERROR)
    end
)
--- Configure the plugin.
function ____exports.setup(overrides)
    local settings = applyOptions(overrides)
    math.randomseed(vim.uv.hrtime() % 2147483647)
    local maps = settings.keymaps
    vim.keymap.set(
        "n",
        maps.play_pause,
        function()
            ____exports.pause()
        end,
        {desc = "Player: play/pause"}
    )
    vim.keymap.set(
        "n",
        maps.next,
        function()
            ____exports.next()
        end,
        {desc = "Player: next"}
    )
    vim.keymap.set(
        "n",
        maps.previous,
        function()
            ____exports.previous()
        end,
        {desc = "Player: previous"}
    )
    vim.keymap.set(
        "n",
        maps.lyrics,
        function()
            ____exports.showLyrics()
        end,
        {desc = "Player: lyrics"}
    )
    setActions({
        toggle_pause = actionTogglePause,
        play_next = actionNext,
        play_previous = actionPrevious,
        show_lyrics = actionShowLyrics,
        search_lyrics = actionSearchLyrics,
        search_jiosaavn = actionSearchJioSaavn,
        toggle_visualizer = actionVisualize,
        configure_filter = actionFilter,
        configure_eq = actionEq,
        show_queue = actionQueueList,
        toggle_shuffle = actionToggleShuffle,
        cycle_repeat = actionCycleRepeat,
        pick_local = actionPickLocal,
        volume_down = actionVolumeDown,
        volume_up = actionVolumeUp,
        close_lyrics = actionCloseLyrics,
        translate_lyrics = actionTranslateLyrics,
        toggle_follow = actionToggleFollow,
        play_url = actionPlayUrl
    })
    vim.api.nvim_create_autocmd(
        "VimResized",
        {
            group = vim.api.nvim_create_augroup("player_nvim_resize", {clear = true}),
            callback = function()
                ui.onResize()
            end
        }
    )
end
return ____exports
