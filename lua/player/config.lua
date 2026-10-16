local ____exports = {}
local function defaultOptions()
    return {
        mpv = "mpv",
        yt_dlp = "yt-dlp",
        http = "curl",
        mpv_args = {},
        download_dir = vim.fn.expand("~/Music"),
        default_volume = 75,
        seek_step = 5,
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
        translator = {url = "http://127.0.0.1:5000", api_key = "", source = "auto"},
        lyric = {
            follow = true,
            auto = true,
            lrc_red = "https://lrc.red",
            lrclib = "https://lrclib.net",
            jiosaavn_api = "https://saavn.sumit.co",
            sources = {"lrc.red", "lrclib", "jiosaavn"},
            timeout = 20
        },
        search = {
            sources = {"ytdlp", "archive", "audius"},
            limit = 12,
            youtube = "ytsearch",
            invidious = "",
            audius = "https://api.audius.co",
            archive = "https://archive.org",
            timeout = 20
        },
        keymaps = {play_pause = "<Leader>mp", next = "<Leader>mn", previous = "<Leader>mb", lyrics = "<Leader>ml"}
    }
end
local current = defaultOptions()
--- The live option table; mutating nested fields is allowed.
function ____exports.get()
    return current
end
function ____exports.defaults()
    return defaultOptions()
end
function ____exports.setup(user)
    local merged = user == nil and defaultOptions() or vim.tbl_deep_extend(
        "force",
        defaultOptions(),
        user
    )
    current = merged
    return current
end
return ____exports
