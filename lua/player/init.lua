-- Lua Library inline imports
local function __TS__ArrayIndexOf(self, searchElement, fromIndex)
    if fromIndex == nil then
        fromIndex = 0
    end
    local len = #self
    if len == 0 then
        return -1
    end
    if fromIndex >= len then
        return -1
    end
    if fromIndex < 0 then
        fromIndex = len + fromIndex
        if fromIndex < 0 then
            fromIndex = 0
        end
    end
    for i = fromIndex + 1, len do
        if self[i] == searchElement then
            return i - 1
        end
    end
    return -1
end
-- End of Lua Library inline imports
local ____exports = {}
local nowPlaying, stopProgress, startProgress, currentTrackInfo, firstText, autoLyrics, wireMpv, playTrack, playAt, openCandidate, state
local ____config = require("player.config")
local getOptions = ____config.get
local setupConfig = ____config.setup
local defaults = ____config.defaults
local highlights = require("player.highlights")
local http = require("player.http")
local karaoke = require("player.karaoke")
local lyrics = require("player.lyrics")
local mpv = require("player.mpv")
local search = require("player.search")
local ytdlp = require("player.sources.ytdlp")
local ui = require("player.ui")
local ____util = require("player.util")
local asNumber = ____util.asNumber
local asRecord = ____util.asRecord
local asText = ____util.asText
local fail = ____util.fail
local formatTime = ____util.formatTime
local lower = ____util.lower
local notify = ____util.notify
local trim = ____util.trim
local upper = ____util.upper
local warn = ____util.warn
function nowPlaying(track)
    return {
        title = track.title,
        artist = track.artist,
        album = track.album or "",
        duration = track.duration or 0,
        provider = track.provider,
        url = track.url
    }
end
function stopProgress()
    if state.progressTimer ~= nil then
        state.progressTimer.stop()
        if not state.progressTimer.is_closing() then
            state.progressTimer.close()
        end
        state.progressTimer = nil
    end
end
function startProgress()
    if state.progressTimer ~= nil then
        return
    end
    local timer = vim.uv.new_timer()
    state.progressTimer = timer
    timer.start(
        0,
        500,
        vim.schedule_wrap(function()
            if not mpv.isAlive() then
                stopProgress()
                return
            end
            mpv.poll(
                "time-pos",
                function(position)
                    if position == nil then
                        return
                    end
                    mpv.poll(
                        "duration",
                        function(duration)
                            local ____ui_setProgress_4 = ui.setProgress
                            local ____position_3 = position
                            local ____duration_2 = duration
                            if ____duration_2 == nil then
                                local ____opt_0 = state.now
                                ____duration_2 = ____opt_0 and ____opt_0.duration
                            end
                            ____ui_setProgress_4(____position_3, ____duration_2 or 0)
                        end
                    )
                end
            )
        end)
    )
end
function currentTrackInfo(done)
    mpv.getProperty(
        "metadata",
        function(metadata)
            local meta = asRecord(metadata)
            mpv.getProperty(
                "media-title",
                function(mediaTitle)
                    mpv.getProperty(
                        "duration",
                        function(duration)
                            local ____done_11 = done
                            local ____temp_8 = firstText(meta, {"title", "tit2"}) or trim(asText(mediaTitle))
                            local ____firstText_result_9 = firstText(meta, {"artist", "tpe1", "album_artist", "icy-name"})
                            local ____firstText_result_10 = firstText(meta, {"album", "talb"})
                            local ____duration_7 = duration
                            if ____duration_7 == nil then
                                local ____opt_5 = state.now
                                ____duration_7 = ____opt_5 and ____opt_5.duration
                            end
                            ____done_11({
                                title = ____temp_8,
                                artist = ____firstText_result_9,
                                album = ____firstText_result_10,
                                duration = ____duration_7 or 0,
                                isrc = upper(firstText(meta, {"isrc", "tsrc"}))
                            })
                        end
                    )
                end
            )
        end
    )
end
function firstText(meta, names)
    for ____, name in ipairs(names) do
        local value = meta[name]
        if value ~= nil then
            local text = trim(asText(value))
            if text ~= "" then
                return text
            end
        end
    end
    for key in pairs(meta) do
        local lowered = lower(key)
        for ____, name in ipairs(names) do
            if lowered == name then
                local text = trim(asText(meta[key]))
                if text ~= "" then
                    return text
                end
            end
        end
    end
    return ""
end
function autoLyrics()
    if not getOptions().lyric.auto then
        return
    end
    if not karaoke.isOpen() then
        return
    end
    currentTrackInfo(function(info)
        if info.title == "" and info.isrc == "" then
            return
        end
        lyrics.resolveTrack(
            info,
            function(set, ____error)
                if set == nil then
                    ui.setLyricStatus(____error or "not found")
                    return
                end
                karaoke.open(set)
                ui.setLyricStatus(lyrics.describeSet(set))
            end
        )
    end)
end
function wireMpv()
    if state.wired then
        return
    end
    state.wired = true
    mpv.observe(
        "pause",
        function(value)
            local paused = value == true
            ui.setPlaying(not paused)
        end
    )
    mpv.observe(
        "duration",
        function(value)
            local duration = asNumber(value)
            if duration ~= nil and duration > 0 and state.now ~= nil and state.now.duration == 0 then
                state.now.duration = duration
                ui.setNow(state.now)
            end
        end
    )
    mpv.observe(
        "metadata",
        function()
            if not getOptions().lyric.auto then
                return
            end
            currentTrackInfo(function(info)
                if state.now == nil then
                    return
                end
                state.now.isrc = info.isrc
                if info.title ~= "" then
                    state.now.title = info.title
                end
                if info.artist ~= "" then
                    state.now.artist = info.artist
                end
                if info.album ~= "" then
                    state.now.album = info.album
                end
                ui.setNow(state.now)
            end)
        end
    )
    mpv.onEvent(function(message)
        if message.event == "end-file" then
            ui.setBuffering(false)
            ui.setPlaying(false)
            if message.reason == "eof" then
                ____exports.next()
            elseif message.reason == "error" then
                fail("mpv could not play the track." .. (message.file_error == nil and "" or " " .. message.file_error))
            end
            return
        end
        if message.event == "file-loaded" then
            ui.setBuffering(false)
            ui.setPlaying(true)
            mpv.setVolume(state.volume)
            mpv.applyAudio()
            autoLyrics()
        end
    end)
end
function playTrack(track)
    if not mpv.ensure() then
        return
    end
    wireMpv()
    state.now = nowPlaying(track)
    ui.setNow(state.now)
    ui.setBuffering(true)
    ui.setLyricStatus("looking up…")
    startProgress()
    mpv.play(
        track.url,
        function(____error)
            if ____error ~= nil then
                ui.setBuffering(false)
                ui.setLyricStatus("unavailable")
                return
            end
            mpv.setVolume(state.volume)
            mpv.applyAudio()
        end
    )
end
function playAt(index)
    local track = state.queue[index + 1]
    if track == nil then
        warn("Nothing left in the queue.")
        return
    end
    state.index = index
    playTrack(track)
end
function ____exports.next()
    if #state.queue == 0 then
        warn("The queue is empty.")
        return
    end
    playAt((state.index + 1) % #state.queue)
end
function ____exports.setVolume(level)
    state.volume = math.max(
        0,
        math.min(
            130,
            math.floor(level)
        )
    )
    ui.setVolume(state.volume > 100 and 100 or state.volume)
    if mpv.isAlive() then
        mpv.setVolume(state.volume)
    end
end
function openCandidate(candidate)
    ui.setLyricStatus("fetching…")
    lyrics.fetch(
        candidate,
        function(set, ____error)
            if set == nil then
                ui.setLyricStatus("unavailable")
                fail("Could not load lyrics: " .. (____error or "unknown error"))
                return
            end
            karaoke.open(set)
            ui.setLyricStatus(lyrics.describeSet(set))
            notify("Lyrics: " .. lyrics.describeSet(set))
        end
    )
end
state = {
    queue = {},
    index = -1,
    lastQuery = "",
    volume = 75,
    wired = false
}
local configured = false
local leaveHook = false
--- True once `setup()` has run, so `plugin/` does not clobber a user's options.
function ____exports.isConfigured()
    return configured
end
--- Probe the HTTP layer and the lyric services it talks to.
function ____exports.doctor()
    http.check(function(summary)
        local lines = {unpack(summary)}
        lines[#lines + 1] = "mpv: " .. (vim.fn.executable(getOptions().mpv) == 1 and "found" or ("NOT FOUND (" .. getOptions().mpv) .. ")")
        lines[#lines + 1] = "yt-dlp: " .. (ytdlp.available() and "found" or "not found (the ytdlp source needs it)")
        notify(table.concat(lines, "\n"))
    end)
end
--- mpv's own output, which is what to read when a track will not start.
function ____exports.diagnostics()
    local text = mpv.diagnostics()
    if text == "" then
        notify(mpv.isAlive() and "mpv is running and has not reported anything yet." or "mpv has not been started yet.")
        return
    end
    notify(text, vim.log.levels.WARN)
end
--- Queue a track and start it, expanding Internet Archive items if needed.
local function playFromQueue(track)
    if track.provider ~= "archive" then
        state.queue = #state.queue > 0 and state.queue or ({track})
        state.index = __TS__ArrayIndexOf(state.queue, track) >= 0 and __TS__ArrayIndexOf(state.queue, track) or 0
        playTrack(track)
        return
    end
    search.resolve(
        track,
        function(tracks)
            if #tracks == 0 then
                fail("That Internet Archive item has no playable audio.")
                return
            end
            state.queue = tracks
            state.index = 0
            ui.setTracks(tracks)
            playTrack(tracks[1])
        end
    )
end
function ____exports.playSelection()
    local track = ui.selection()
    if track == nil then
        warn("Select a result first (search with :Player <query>).")
        return
    end
    playFromQueue(track)
end
function ____exports.playUrl(url)
    local target = trim(url)
    if target == "" then
        warn("Give :PlayerUrl something to play.")
        return
    end
    local track = {
        provider = "url",
        title = target,
        artist = "",
        album = "",
        url = target
    }
    state.queue = {track}
    state.index = 0
    playTrack(track)
end
function ____exports.previous()
    if #state.queue == 0 then
        warn("The queue is empty.")
        return
    end
    playAt((state.index - 1 + #state.queue) % #state.queue)
end
function ____exports.togglePlay()
    if not mpv.ensure() then
        return
    end
    mpv.isPlaying(function(playing) return mpv.setPaused(playing) end)
end
function ____exports.seekRelative(delta)
    if not mpv.ensure() then
        return
    end
    mpv.nudge(delta)
end
function ____exports.nudgeVolume(delta)
    ____exports.setVolume(state.volume + delta)
end
function ____exports.stop()
    stopProgress()
    mpv.stop()
    ui.setPlaying(false)
    ui.setBuffering(false)
    ui.setLyricStatus("stopped")
end
function ____exports.close()
    karaoke.close()
    ui.close()
end
function ____exports.toggleVisualizer()
    if not mpv.ensure() then
        return
    end
    local enabled = not mpv.isVisualizing()
    mpv.visualize(enabled)
    ui.setVisualizer(enabled)
end
function ____exports.searchTracks(query)
    local term = trim(query)
    if term == "" then
        warn("Give :Player a search query.")
        return
    end
    state.lastQuery = term
    ui.open()
    ui.setQuery(term)
    ui.setTracks({})
    ui.setLyricStatus("no lyrics loaded")
    search.run(
        {query = term},
        function(tracks, errors)
            ui.setTracks(tracks)
            state.queue = tracks
            state.index = -1
            if #tracks == 0 then
                local detail = #errors > 0 and "\n" .. errors[1] or ""
                fail((("No results for \"" .. term) .. "\".") .. detail)
                return
            end
            notify(((tostring(#tracks) .. " result(s) for \"") .. term) .. "\".")
        end
    )
end
function ____exports.reSearch()
    if state.lastQuery == "" then
        warn("Nothing to repeat yet.")
        return
    end
    ____exports.searchTracks(state.lastQuery)
end
--- Download the selected result with yt-dlp instead of streaming it.
function ____exports.downloadSelection()
    local track = ui.selection()
    if track == nil then
        warn("Select a result to download first.")
        return
    end
    ytdlp.download(
        track.url,
        function(ok, message) return notify(message, ok and vim.log.levels.INFO or vim.log.levels.ERROR) end
    )
end
function ____exports.status()
    local parts = {}
    parts[#parts + 1] = state.now == nil and "Nothing playing." or ((((("Playing " .. state.now.title) .. " — ") .. state.now.artist) .. " (") .. state.now.provider) .. ")"
    parts[#parts + 1] = ((("Queue: " .. tostring(#state.queue)) .. " track(s), position ") .. tostring(state.index + 1)) .. "."
    parts[#parts + 1] = ((("Volume: " .. tostring(state.volume)) .. "%. Visualizer: ") .. (mpv.isVisualizing() and "on" or "off")) .. "."
    parts[#parts + 1] = ("Search sources: " .. table.concat(
        getOptions().search.sources,
        ", "
    )) .. "."
    parts[#parts + 1] = ("Lyric sources: " .. table.concat(
        getOptions().lyric.sources,
        ", "
    )) .. "."
    local diagnostics = mpv.diagnostics()
    if diagnostics ~= "" then
        parts[#parts + 1] = diagnostics
    end
    notify(table.concat(parts, "\n"))
end
--- Which sources are configured and reachable from here.
function ____exports.sources()
    local music = {}
    for ____, source in ipairs(search.SOURCES) do
        music[#music + 1] = source
    end
    local missing = ytdlp.available() and "" or " (yt-dlp not on PATH — the ytdlp source will fail)"
    notify(((((("Music sources: " .. table.concat(music, ", ")) .. missing) .. "\nEnabled: ") .. table.concat(
        getOptions().search.sources,
        ", "
    )) .. "\nLyrics: ") .. table.concat(
        getOptions().lyric.sources,
        ", "
    ))
end
local function showCandidates(candidates)
    if #candidates == 0 then
        fail("No lyrics matched that query.")
        return
    end
    local labels = {}
    for ____, candidate in ipairs(candidates) do
        local duration = candidate.duration ~= nil and candidate.duration > 0 and " " .. formatTime(candidate.duration) or ""
        labels[#labels + 1] = ((((((candidate.title .. " — ") .. candidate.artist) .. duration) .. " [") .. candidate.provider) .. (candidate.sync == "word" and " · word-sync" or "")) .. "]"
    end
    vim.ui.select(
        labels,
        {prompt = "Pick lyrics"},
        function(_choice, index)
            if index == nil then
                return
            end
            local candidate = candidates[index]
            if candidate == nil then
                return
            end
            openCandidate(candidate)
        end
    )
end
--- Lyrics for whatever is playing, falling back to a search.
function ____exports.lyricsForCurrent()
    currentTrackInfo(function(info)
        if info.title == "" then
            warn("Nothing is playing, so there is nothing to look up. Use :PlayerLyricsSearch <query>.")
            return
        end
        ui.setLyricStatus(("looking up \"" .. info.title) .. "\"…")
        lyrics.resolveTrack(
            info,
            function(set)
                if set == nil then
                    ui.setLyricStatus("not found")
                    lyrics.search(
                        (info.artist .. " ") .. info.title,
                        function(candidates) return showCandidates(candidates) end
                    )
                    return
                end
                karaoke.open(set)
                ui.setLyricStatus(lyrics.describeSet(set))
            end
        )
    end)
end
function ____exports.lyricsSearch(query)
    local term = trim(query)
    if term == "" then
        ____exports.lyricsForCurrent()
        return
    end
    ui.setLyricStatus(("searching \"" .. term) .. "\"…")
    lyrics.search(
        term,
        function(candidates, errors)
            if #candidates == 0 and #errors > 0 then
                fail("Lyric search failed: " .. errors[1])
                return
            end
            showCandidates(candidates)
        end
    )
end
function ____exports.lyricsByIsrc(isrc)
    local code = upper(trim(isrc))
    if code == "" then
        warn("Give :PlayerLyricsIsrc an ISRC code.")
        return
    end
    ui.setLyricStatus(("ISRC " .. code) .. "…")
    lyrics.fetchIsrc(
        code,
        function(set, ____error)
            if set == nil then
                ui.setLyricStatus("not found")
                fail((("No lrc.red lyrics for ISRC " .. code) .. ": ") .. (____error or "not found"))
                return
            end
            karaoke.open(set)
            ui.setLyricStatus(lyrics.describeSet(set))
        end
    )
end
function ____exports.translateLyrics(target)
    karaoke.translateTo(target)
end
--- Apply user options, define highlights and hook the dashboard together.
function ____exports.setup(user)
    configured = true
    setupConfig(user)
    highlights.define()
    state.volume = getOptions().default_volume
    ui.wire({
        playSelection = ____exports.playSelection,
        openLyrics = ____exports.lyricsForCurrent,
        togglePlay = ____exports.togglePlay,
        next = ____exports.next,
        previous = ____exports.previous,
        seekRelative = ____exports.seekRelative,
        nudgeVolume = ____exports.nudgeVolume,
        toggleVisualizer = ____exports.toggleVisualizer,
        translate = function() return ____exports.translateLyrics(nil) end,
        reSearch = ____exports.reSearch,
        stop = ____exports.stop,
        close = ____exports.close
    })
    ui.setVolume(state.volume > 100 and 100 or state.volume)
    wireMpv()
    if not leaveHook then
        leaveHook = true
        vim.api.nvim_create_autocmd(
            "VimLeavePre",
            {callback = function()
                stopProgress()
                mpv.shutdown()
                return false
            end}
        )
    end
end
____exports.defaults = defaults
____exports.search = search
____exports.mpv = mpv
____exports.ui = ui
____exports.karaoke = karaoke
____exports.lyrics = lyrics
____exports.getOptions = getOptions
return ____exports
