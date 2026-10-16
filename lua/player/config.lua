--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
local ____lua_2Dutil = require("player.lua-util")
local copy = ____lua_2Dutil.copy
local indexOf = ____lua_2Dutil.indexOf
--- True when the value is a Lua table.
local function isTable(value)
    return type(value) == "table"
end
--- True when the value is a string.
local function isString(value)
    return type(value) == "string"
end
--- True when the value is a number.
local function isNumber(value)
    return type(value) == "number"
end
--- True when the value is a boolean.
local function isBoolean(value)
    return type(value) == "boolean"
end
--- Keep the numeric entries of a table.
local function numberArray(value)
    if not isTable(value) then
        return {}
    end
    local out = {}
    local source = value
    do
        local index = 0
        while index < #source do
            if isNumber(source[index + 1]) then
                out[#out + 1] = source[index + 1]
            end
            index = index + 1
        end
    end
    return out
end
--- Keep the string entries of a table.
local function stringArray(value)
    if not isTable(value) then
        return {}
    end
    local out = {}
    local source = value
    do
        local index = 0
        while index < #source do
            if isString(source[index + 1]) then
                out[#out + 1] = source[index + 1]
            end
            index = index + 1
        end
    end
    return out
end
--- Default configuration.
function ____exports.defaults()
    return {
        mpv = "mpv",
        yt_dlp = "yt-dlp",
        node = "node",
        jiosaavn_api = "https://saavn.sumit.co",
        translator = {url = "http://127.0.0.1:5000", api_key = "", source = "auto"},
        use_telescope = true,
        download_dir = "~/Music",
        default_volume = 75,
        eq = {enabled = false, bands = {
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
        }, frequencies = {
            31,
            63,
            125,
            250,
            500,
            1000,
            2000,
            4000,
            8000,
            16000
        }},
        filter = {enabled = false, type = "off", frequency = 1000, width = 1},
        mpv_args = {},
        lyric = {source = "lrc.red", follow = true, interval = 120},
        keymaps = {play_pause = "<Space>", next = "]n", previous = "[n", lyrics = "l"}
    }
end
local FILTER_TYPES = {"off", "lowpass", "highpass", "bandpass"}
local REPEAT_MODES = {"off", "queue", "track"}
local function clamp(value, low, high)
    if value < low then
        return low
    end
    if value > high then
        return high
    end
    return value
end
local function trimSlash(url)
    if #url > 1 and string.sub(url, #url, #url) == "/" then
        return string.sub(url, 1, #url - 1)
    end
    return url
end
--- Deep copy of the plain data structures used by the configuration.
function ____exports.clone(options)
    return {
        mpv = options.mpv,
        yt_dlp = options.yt_dlp,
        node = options.node,
        jiosaavn_api = options.jiosaavn_api,
        translator = {url = options.translator.url, api_key = options.translator.api_key, source = options.translator.source},
        use_telescope = options.use_telescope,
        download_dir = options.download_dir,
        default_volume = options.default_volume,
        eq = {
            enabled = options.eq.enabled,
            bands = copy(options.eq.bands),
            frequencies = copy(options.eq.frequencies)
        },
        filter = {enabled = options.filter.enabled, type = options.filter.type, frequency = options.filter.frequency, width = options.filter.width},
        mpv_args = copy(options.mpv_args),
        lyric = {source = options.lyric.source, follow = options.lyric.follow, interval = options.lyric.interval},
        keymaps = {play_pause = options.keymaps.play_pause, next = options.keymaps.next, previous = options.keymaps.previous, lyrics = options.keymaps.lyrics}
    }
end
--- Merge user options into the defaults.
-- 
-- Lists (`eq.bands`, `eq.frequencies`, `mpv_args`) are replaced wholesale
-- instead of being merged element by element, which is what a user expects
-- when they pass a shorter or longer list. Invalid values are clamped or
-- ignored so that a typo can never break the plugin.
function ____exports.merge(base, overrides)
    local options = ____exports.clone(base)
    if not isTable(overrides) then
        return options
    end
    local given = overrides
    if isString(given.mpv) and given.mpv ~= "" then
        options.mpv = given.mpv
    end
    if isString(given.yt_dlp) and given.yt_dlp ~= "" then
        options.yt_dlp = given.yt_dlp
    end
    if isString(given.node) and given.node ~= "" then
        options.node = given.node
    end
    if isString(given.jiosaavn_api) and given.jiosaavn_api ~= "" then
        options.jiosaavn_api = trimSlash(given.jiosaavn_api)
    end
    if isTable(given.translator) then
        local translator = given.translator
        if isString(translator.url) and translator.url ~= "" then
            options.translator.url = trimSlash(translator.url)
        end
        if isString(translator.api_key) then
            options.translator.api_key = translator.api_key
        end
        if isString(translator.source) and translator.source ~= "" then
            options.translator.source = translator.source
        end
    end
    if isBoolean(given.use_telescope) then
        options.use_telescope = given.use_telescope
    end
    if isString(given.download_dir) and given.download_dir ~= "" then
        options.download_dir = given.download_dir
    end
    if isNumber(given.default_volume) then
        options.default_volume = clamp(
            math.floor(given.default_volume + 0.5),
            0,
            100
        )
    end
    if isTable(given.eq) then
        local eq = given.eq
        if isBoolean(eq.enabled) then
            options.eq.enabled = eq.enabled
        end
        local bands = numberArray(eq.bands)
        if #bands == #options.eq.bands then
            do
                local index = 0
                while index < #bands do
                    options.eq.bands[index + 1] = clamp(bands[index + 1], -12, 12)
                    index = index + 1
                end
            end
        end
        local frequencies = numberArray(eq.frequencies)
        if #frequencies == #options.eq.frequencies then
            do
                local index = 0
                while index < #frequencies do
                    options.eq.frequencies[index + 1] = clamp(
                        math.floor(frequencies[index + 1] + 0.5),
                        20,
                        20000
                    )
                    index = index + 1
                end
            end
        end
    end
    if isTable(given.filter) then
        local filter = given.filter
        if isBoolean(filter.enabled) then
            options.filter.enabled = filter.enabled
        end
        if isString(filter.type) and indexOf(FILTER_TYPES, filter.type) >= 0 then
            options.filter.type = filter.type
        end
        if isNumber(filter.frequency) then
            options.filter.frequency = clamp(
                math.floor(filter.frequency + 0.5),
                20,
                20000
            )
        end
        if isNumber(filter.width) then
            options.filter.width = clamp(filter.width, 0.1, 10)
        end
    end
    if isTable(given.mpv_args) then
        options.mpv_args = stringArray(given.mpv_args)
    end
    if isTable(given.lyric) then
        local lyric = given.lyric
        if isString(lyric.source) and lyric.source ~= "" then
            options.lyric.source = lyric.source
        end
        if isBoolean(lyric.follow) then
            options.lyric.follow = lyric.follow
        end
        if isNumber(lyric.interval) then
            options.lyric.interval = clamp(
                math.floor(lyric.interval + 0.5),
                40,
                1000
            )
        end
    end
    if isTable(given.keymaps) then
        local keymaps = given.keymaps
        if isString(keymaps.play_pause) then
            options.keymaps.play_pause = keymaps.play_pause
        end
        if isString(keymaps.next) then
            options.keymaps.next = keymaps.next
        end
        if isString(keymaps.previous) then
            options.keymaps.previous = keymaps.previous
        end
        if isString(keymaps.lyrics) then
            options.keymaps.lyrics = keymaps.lyrics
        end
    end
    return options
end
--- True when the value is one of the supported repeat modes.
function ____exports.isRepeatMode(value)
    return indexOf(REPEAT_MODES, value) >= 0
end
--- True when the value is one of the supported filter types.
function ____exports.isFilterType(value)
    return indexOf(FILTER_TYPES, value) >= 0
end
local current = ____exports.defaults()
--- The options the plugin is running with.
function ____exports.options()
    return current
end
--- Apply the user options.
-- 
-- Every call starts from the defaults again, so calling `setup()` twice never
-- leaves stale values behind.
function ____exports.setup(overrides)
    current = ____exports.merge(
        ____exports.defaults(),
        overrides
    )
    current.download_dir = vim.fn.expand(current.download_dir)
    return current
end
return ____exports
