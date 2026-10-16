--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____actions = require("player.actions")
local actions = ____actions.actions
local ____config = require("player.config")
local options = ____config.options
local ____helper = require("player.helper")
local helperCall = ____helper.helperCall
local mpv = require("player.mpv")
local ____ttml = require("player.ttml")
local parseLrc = ____ttml.parseLrc
local parseTtml = ____ttml.parseTtml
local function toLyricLines(value)
    if type(value) ~= "table" then
        return {}
    end
    local rows = {}
    local source = value
    do
        local index = 0
        while index < #source do
            do
                local __continue5
                repeat
                    local entry = source[index + 1]
                    if type(entry) ~= "table" then
                        __continue5 = true
                        break
                    end
                    local record = entry
                    local text = record.text
                    if type(text) ~= "string" or text == "" then
                        __continue5 = true
                        break
                    end
                    local row = {
                        start = type(record.start) == "number" and record.start or 0,
                        finish = type(record.finish) == "number" and record.finish or 0,
                        text = text
                    }
                    if record.words ~= nil and type(record.words) == "table" then
                        local words = record.words
                        local parsed = {}
                        do
                            local wordIndex = 0
                            while wordIndex < #words do
                                do
                                    local __continue10
                                    repeat
                                        local word = words[wordIndex + 1]
                                        if type(word.text) ~= "string" or word.text == "" then
                                            __continue10 = true
                                            break
                                        end
                                        parsed[#parsed + 1] = {
                                            start = type(word.start) == "number" and word.start or 0,
                                            finish = type(word.finish) == "number" and word.finish or 0,
                                            text = word.text
                                        }
                                        __continue10 = true
                                    until true
                                    if not __continue10 then
                                        break
                                    end
                                end
                                wordIndex = wordIndex + 1
                            end
                        end
                        if #parsed > 0 then
                            row.words = parsed
                        end
                    end
                    if type(record.translation) == "string" and record.translation ~= "" then
                        row.translation = record.translation
                    end
                    rows[#rows + 1] = row
                    __continue5 = true
                until true
                if not __continue5 then
                    break
                end
            end
            index = index + 1
        end
    end
    return rows
end
local state = {
    buffer = 0,
    window = 0,
    timer = nil,
    rows = {},
    displayRows = {},
    metadata = {title = "Lyrics", artist = "", album = ""},
    source = "",
    previous = -1,
    position = 0,
    observers = {}
}
local namespace = vim.api.nvim_create_namespace("player.nvim.karaoke")
local function notify(message, level)
    vim.notify(message, level == nil and vim.log.levels.INFO or level, {title = "player.nvim"})
end
local function setStyle()
    vim.api.nvim_set_hl(0, "PlayerSurface", {bg = "#17151d", fg = "#eeeaf2", default = true})
    vim.api.nvim_set_hl(0, "PlayerBorder", {fg = "#d85c86", bg = "#17151d", default = true})
    vim.api.nvim_set_hl(0, "PlayerEyebrow", {fg = "#e58ca5", bold = true, default = true})
    vim.api.nvim_set_hl(0, "PlayerMuted", {fg = "#aaa1b2", default = true})
    vim.api.nvim_set_hl(0, "PlayerLyricActive", {fg = "#fff7fb", bold = true, default = true})
    vim.api.nvim_set_hl(0, "PlayerKaraokeWord", {fg = "#ff7ba4", bold = true, underline = true, default = true})
    vim.api.nvim_set_hl(0, "PlayerTranslation", {fg = "#aaa1b2", italic = true, default = true})
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
local function render()
    if state.buffer == 0 or not vim.api.nvim_buf_is_valid(state.buffer) then
        return
    end
    local lines = {"  NOW PLAYING  /  KARAOKE", "  " .. (state.metadata.title == "" and "Lyrics" or state.metadata.title), ("  " .. state.metadata.artist) .. (state.source == "" and "" or "  ·  " .. state.source), ""}
    local displayRows = {}
    do
        local index = 0
        while index < #state.rows do
            local item = state.rows[index + 1]
            local prefix = item.start > 0 and string.format(
                "  %02d:%02d   ",
                math.floor(item.start / 60),
                math.floor(item.start % 60)
            ) or "  "
            local row = {bufferRow = #lines, textColumn = #prefix, line = item, translationRow = 0}
            lines[#lines + 1] = prefix .. item.text
            if item.translation ~= nil and item.translation ~= "" then
                lines[#lines + 1] = "           " .. item.translation
                row.translationRow = #lines - 1
            end
            displayRows[#displayRows + 1] = row
            index = index + 1
        end
    end
    if #state.rows == 0 then
        lines[#lines + 1] = "  No lyrics found for this track."
    end
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
    state.displayRows = displayRows
    if state.window ~= 0 and vim.api.nvim_win_is_valid(state.window) then
        local width = math.max(
            24,
            math.min(78, vim.o.columns - 8)
        )
        local height = math.max(
            8,
            math.min(
                vim.o.lines - 6,
                vim.api.nvim_buf_line_count(state.buffer) + 1
            )
        )
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
                title = "  ♪  PLAYER  ",
                title_pos = "center"
            }
        )
    end
end
local function update(position)
    if state.buffer == 0 or not vim.api.nvim_buf_is_valid(state.buffer) then
        stopTimer()
        return
    end
    state.position = position
    local hasTiming = false
    do
        local index = 0
        while index < #state.rows do
            if state.rows[index + 1].start > 0 or state.rows[index + 1].words ~= nil then
                hasTiming = true
                break
            end
            index = index + 1
        end
    end
    if not hasTiming then
        return
    end
    local current = -1
    do
        local index = 0
        while index < #state.rows do
            if state.rows[index + 1].start <= position then
                current = index
            else
                break
            end
            index = index + 1
        end
    end
    local changed = current ~= state.previous
    state.previous = current
    vim.api.nvim_buf_clear_namespace(state.buffer, namespace, 0, -1)
    if current < 0 then
        return
    end
    local display = state.displayRows[current + 1]
    if display == nil then
        return
    end
    vim.api.nvim_buf_set_extmark(
        state.buffer,
        namespace,
        display.bufferRow,
        0,
        {line_hl_group = "PlayerLyricActive", priority = 110}
    )
    if display.translationRow > 0 then
        vim.api.nvim_buf_set_extmark(
            state.buffer,
            namespace,
            display.translationRow,
            0,
            {line_hl_group = "PlayerTranslation", priority = 90}
        )
    end
    local line = display.line
    if line.words ~= nil then
        local cursor = 1
        do
            local index = 0
            while index < #line.words do
                do
                    local __continue43
                    repeat
                        local word = line.words[index + 1]
                        local at = string.find(line.text, word.text, cursor, true)
                        if at == nil then
                            __continue43 = true
                            break
                        end
                        cursor = at + #word.text
                        if word.start <= position and (word.finish == 0 or word.finish >= position) then
                            local startColumn = display.textColumn + at - 1
                            local endColumn = startColumn + #word.text
                            vim.api.nvim_buf_set_extmark(
                                state.buffer,
                                namespace,
                                display.bufferRow,
                                startColumn,
                                {end_row = display.bufferRow, end_col = endColumn, hl_group = "PlayerKaraokeWord", priority = 180}
                            )
                        end
                        __continue43 = true
                    until true
                    if not __continue43 then
                        break
                    end
                end
                index = index + 1
            end
        end
    end
    if changed and options().lyric.follow and state.window ~= 0 and vim.api.nvim_win_is_valid(state.window) then
        vim.api.nvim_win_set_cursor(state.window, {display.bufferRow + 1, 0})
        vim.api.nvim_win_call(
            state.window,
            function()
                vim.cmd("normal! zz")
            end
        )
    end
end
local function open(lines, metadata, source)
    stopTimer()
    stopObservers()
    if state.window ~= 0 and vim.api.nvim_win_is_valid(state.window) then
        vim.api.nvim_win_close(state.window, true)
    end
    state.window = 0
    setStyle()
    state.rows = lines
    state.metadata = metadata
    state.source = source
    state.previous = -1
    state.buffer = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_name(
        state.buffer,
        "player://karaoke-" .. tostring(vim.uv.hrtime())
    )
    vim.bo[state.buffer].buftype = "nofile"
    vim.bo[state.buffer].bufhidden = "wipe"
    vim.bo[state.buffer].swapfile = false
    vim.bo[state.buffer].filetype = "playerlyrics"
    render()
    local width = math.max(
        24,
        math.min(78, vim.o.columns - 8)
    )
    local height = math.max(
        8,
        math.min(
            vim.o.lines - 6,
            vim.api.nvim_buf_line_count(state.buffer) + 1
        )
    )
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
            title = "  ♪  PLAYER  ",
            title_pos = "center"
        }
    )
    vim.wo[state.window].wrap = true
    vim.wo[state.window].winhighlight = "Normal:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow"
    vim.wo[state.window].cursorline = false
    local buffer = state.buffer
    vim.keymap.set(
        "n",
        "q",
        function()
            actions().close_lyrics()
        end,
        {buffer = buffer, silent = true, desc = "Close karaoke lyrics"}
    )
    vim.keymap.set(
        "n",
        "<Esc>",
        function()
            actions().close_lyrics()
        end,
        {buffer = buffer, silent = true}
    )
    vim.keymap.set(
        "n",
        "t",
        function()
            actions().translate_lyrics()
        end,
        {buffer = buffer, silent = true, desc = "Translate lyrics"}
    )
    vim.keymap.set(
        "n",
        "f",
        function()
            actions().toggle_follow()
        end,
        {buffer = buffer, silent = true, desc = "Toggle lyric follow"}
    )
    state.timer = vim.uv.new_timer()
    state.timer.start(
        state.timer,
        0,
        options().lyric.interval,
        function()
            mpv.property(
                "time-pos",
                function(value)
                    if type(value) == "number" then
                        update(value)
                    end
                end
            )
        end
    )
    state.observers[#state.observers + 1] = mpv.observe(
        "time-pos",
        function(value)
            if type(value) == "number" then
                update(value)
            end
        end
    )
end
local function isValidIsrc(value)
    return string.match(value, "^[A-Z][A-Z][A-Z0-9][A-Z0-9][A-Z0-9]%d%d%d%d%d%d%d$") ~= nil
end
--- Download the TTML of an ISRC with curl, used when Node.js is missing.
local function fetchTtmlWithCurl(isrc, callback)
    local url = ("https://lrc.red/s/" .. isrc) .. ".ttml"
    vim.system(
        {
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--max-time",
            "20",
            url
        },
        {text = true},
        function(result)
            vim.schedule(function()
                if result.code ~= 0 then
                    callback(nil, result.stderr ~= "" and result.stderr or "Could not fetch TTML from lrc.red.")
                    return
                end
                local rows = parseTtml(result.stdout)
                if #rows == 0 then
                    callback(nil, "The TTML document contained no timed lyric lines.")
                    return
                end
                callback(rows)
            end)
        end
    )
end
--- Fetch the lyrics of an ISRC and show them.
function ____exports.show(isrc)
    local function load(value)
        local normalized = string.gsub(
            string.upper(value),
            "%s+",
            ""
        )
        if not isValidIsrc(normalized) then
            notify("Enter a valid 12 character ISRC (for example, GBUM71029604).", vim.log.levels.ERROR)
            return
        end
        local ttmlArgs = {"ttml", normalized}
        helperCall(
            ttmlArgs,
            nil,
            function(value, ____error)
                if value == nil or value == nil then
                    notify(
                        "Lyrics: " .. tostring(____error),
                        vim.log.levels.WARN
                    )
                    return
                end
                local rows = toLyricLines(value)
                if #rows == 0 then
                    notify("No timed lines found for that ISRC.", vim.log.levels.WARN)
                    return
                end
                open(rows, {title = "ISRC " .. normalized, artist = "", album = ""}, "lrc.red · TTML")
            end,
            nil,
            30000
        )
    end
    if isrc ~= nil and isrc ~= "" then
        load(isrc)
        return
    end
    mpv.property(
        "metadata/by-key/ISRC",
        function(value)
            if type(value) == "string" and value ~= "" then
                load(value)
                return
            end
            vim.ui.input(
                {prompt = "ISRC for lrc.red TTML lyrics: "},
                function(answer)
                    if answer ~= nil and answer ~= "" then
                        load(answer)
                    end
                end
            )
        end
    )
end
local function toCandidates(value)
    if type(value) ~= "table" then
        return {}
    end
    local list = {}
    local source = value
    do
        local index = 0
        while index < #source do
            local entry = source[index + 1]
            if type(entry) == "table" then
                list[#list + 1] = entry
            end
            index = index + 1
        end
    end
    return list
end
local function candidateLabel(candidate)
    local provider = type(candidate.provider) == "string" and candidate.provider or "?"
    local title = type(candidate.title) == "string" and candidate.title or "Unknown title"
    local artist = type(candidate.artist) == "string" and candidate.artist or ""
    local album = type(candidate.album) == "string" and candidate.album or ""
    local isrc = type(candidate.isrc) == "string" and candidate.isrc or ""
    local detail = artist .. (album == "" and "" or " · " .. album)
    return (((("[" .. provider) .. "] ") .. title) .. (detail == "" and "" or " — " .. detail)) .. (isrc == "" and "" or "  ·  " .. isrc)
end
local function searchEnvironment()
    return {PLAYER_JIOSAAVN_API = options().jiosaavn_api}
end
--- Search the lyric catalogs and show the lyrics of the selected result.
function ____exports.search(query)
    local function run(term)
        local searchArgs = {"search", term}
        helperCall(
            searchArgs,
            nil,
            function(value, ____error)
                if value == nil or value == nil then
                    notify(
                        "Lyrics search: " .. tostring(____error),
                        vim.log.levels.ERROR
                    )
                    return
                end
                local candidates = toCandidates(value)
                local choices = {}
                do
                    local index = 0
                    while index < #candidates do
                        if candidates[index + 1].hasLyrics ~= false then
                            choices[#choices + 1] = candidates[index + 1]
                        end
                        index = index + 1
                    end
                end
                if #choices == 0 then
                    notify("No lyric matches found.", vim.log.levels.WARN)
                    return
                end
                vim.ui.select(
                    choices,
                    {
                        prompt = "Lyrics search · LRCLIB + MusicBrainz + iTunes + JioSaavn",
                        format_item = function(item)
                            return candidateLabel(item)
                        end
                    },
                    function(item)
                        if item == nil or item == nil then
                            return
                        end
                        local candidate = item
                        local lyricsArgs = {"lyrics"}
                        helperCall(
                            lyricsArgs,
                            vim.json.encode(candidate),
                            function(result, failure)
                                if result == nil or result == nil then
                                    notify(
                                        "Lyrics: " .. tostring(failure),
                                        vim.log.levels.WARN
                                    )
                                    return
                                end
                                local payload = result
                                local rows = toLyricLines(payload.lines)
                                if #rows == 0 then
                                    notify("No lyrics are available for that result.", vim.log.levels.WARN)
                                    return
                                end
                                local ____payload_candidate_0 = payload.candidate
                                if ____payload_candidate_0 == nil then
                                    ____payload_candidate_0 = candidate
                                end
                                local resolved = ____payload_candidate_0
                                open(
                                    rows,
                                    {
                                        title = type(resolved.title) == "string" and resolved.title or "Lyrics",
                                        artist = type(resolved.artist) == "string" and resolved.artist or "",
                                        album = type(resolved.album) == "string" and resolved.album or ""
                                    },
                                    type(payload.source) == "string" and payload.source or "Lyrics"
                                )
                            end,
                            searchEnvironment(),
                            30000
                        )
                    end
                )
            end,
            searchEnvironment(),
            30000
        )
    end
    if query ~= nil and query ~= "" then
        run(query)
        return
    end
    vim.ui.input(
        {prompt = "Search lyrics by song, artist, or phrase: "},
        function(answer)
            if answer ~= nil and answer ~= "" then
                run(answer)
            end
        end
    )
end
--- Look the JioSaavn catalog up.
-- 
-- The callback receives the songs of the catalog; it is used by the search of
-- the player and by the `:PlayerJioSaavn` command.
function ____exports.jiosaavnCandidates(query, callback)
    local jioArgs = {"search", query}
    helperCall(
        jioArgs,
        nil,
        function(value, ____error)
            if value == nil or value == nil then
                callback({}, ____error == nil and "The JioSaavn catalog could not be reached." or ____error)
                return
            end
            local candidates = toCandidates(value)
            local songs = {}
            do
                local index = 0
                while index < #candidates do
                    if candidates[index + 1].provider == "JioSaavn" then
                        songs[#songs + 1] = candidates[index + 1]
                    end
                    index = index + 1
                end
            end
            callback(songs)
        end,
        searchEnvironment(),
        30000
    )
end
--- Search the JioSaavn catalog and play the selected song.
function ____exports.searchJioSaavn(query)
    local function run(term)
        ____exports.jiosaavnCandidates(
            term,
            function(songs, ____error)
                if ____error ~= nil then
                    notify(
                        "JioSaavn search: " .. tostring(____error),
                        vim.log.levels.ERROR
                    )
                    return
                end
                if #songs == 0 then
                    notify("No JioSaavn songs found.", vim.log.levels.WARN)
                    return
                end
                vim.ui.select(
                    songs,
                    {
                        prompt = "JioSaavn · unofficial catalog search",
                        format_item = function(item)
                            local candidate = item
                            local title = type(candidate.title) == "string" and candidate.title or "Unknown title"
                            local artist = type(candidate.artist) == "string" and candidate.artist or ""
                            local language = type(candidate.language) == "string" and candidate.language or ""
                            return (title .. (artist == "" and "" or " — " .. artist)) .. (language == "" and "" or " · " .. language)
                        end
                    },
                    function(item)
                        if item == nil or item == nil then
                            return
                        end
                        local candidate = item
                        local url = candidate.url
                        if type(url) == "string" and url ~= "" then
                            actions().play_url(url)
                        else
                            notify("That result has no playable link.", vim.log.levels.WARN)
                        end
                    end
                )
            end
        )
    end
    if query ~= nil and query ~= "" then
        run(query)
        return
    end
    vim.ui.input(
        {prompt = "Search JioSaavn: "},
        function(answer)
            if answer ~= nil and answer ~= "" then
                run(answer)
            end
        end
    )
end
--- Translate the lyrics that are currently open.
function ____exports.translate(target)
    if #state.rows == 0 then
        notify("Open lyrics before translating.", vim.log.levels.WARN)
        return
    end
    local function run(language)
        local translator = options().translator
        local payload = {}
        do
            local index = 0
            while index < #state.rows do
                local row = state.rows[index + 1]
                payload[#payload + 1] = {start = row.start, finish = row.finish, text = row.text}
                index = index + 1
            end
        end
        local translateArgs = {"translate", language, translator.source}
        helperCall(
            translateArgs,
            vim.json.encode(payload),
            function(value, ____error)
                if value == nil or value == nil then
                    notify(
                        "Translation: " .. tostring(____error),
                        vim.log.levels.ERROR
                    )
                    return
                end
                if type(value) ~= "table" then
                    notify("Translation: unexpected helper response.", vim.log.levels.ERROR)
                    return
                end
                local translations = value
                if #translations ~= #state.rows then
                    notify("The translation does not match the lyric lines and was discarded.", vim.log.levels.WARN)
                    return
                end
                do
                    local index = 0
                    while index < #state.rows do
                        local text = translations[index + 1]
                        state.rows[index + 1].translation = type(text) == "string" and text or ""
                        index = index + 1
                    end
                end
                state.previous = -1
                render()
                update(state.position)
                notify(("Lyrics translated to " .. language) .. ".")
            end,
            {PLAYER_TRANSLATE_URL = translator.url, PLAYER_TRANSLATE_API_KEY = translator.api_key},
            90000
        )
    end
    if target ~= nil and target ~= "" then
        run(target)
        return
    end
    vim.ui.input(
        {prompt = "Target language code (e.g. en, vi, hi, ja): ", default = "en"},
        function(answer)
            if answer ~= nil and answer ~= "" then
                run(answer)
            end
        end
    )
end
--- Close the lyric viewer.
function ____exports.close()
    stopTimer()
    stopObservers()
    if state.window ~= 0 and vim.api.nvim_win_is_valid(state.window) then
        vim.api.nvim_win_close(state.window, true)
    end
    state.window = 0
    state.buffer = 0
    state.rows = {}
    state.displayRows = {}
end
--- True when the lyric viewer is open.
function ____exports.isOpen()
    return state.window ~= 0 and vim.api.nvim_win_is_valid(state.window)
end
--- Parse an LRC document, exposed for the tests.
function ____exports.lyricsFromLrc(lrc)
    return parseLrc(lrc)
end
return ____exports
