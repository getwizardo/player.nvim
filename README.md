# player.nvim

A music player for Neovim, written in Lua with a TypeScript lyrics/search/translation helper. Its centered, rounded dashboard and karaoke float use a dark Apple Music-inspired palette, animated now-playing/progress, and timed line/word highlighting. Neovim supplies the UI and controls; **mpv** does the actual decoding and playback.

## Features

- Local files, streaming URLs and yt-dlp-supported sources, including JioSaavn links through yt-dlp's JioSaavn extractor.
- JioSaavn catalog search and play by its public song permalink (the search API is an unofficial third-party wrapper; no direct media URL extraction or DRM workaround is implemented here).
- LRCLIB + JioSaavn-catalog lyrics search; direct ISRC-based TTML from [lrc.red](https://lrc.red); line-synced LRC and plain-lyrics fallback.
- Karaoke view with word-level TTML timing where supplied, current-line follow, optional translation rows and a persistent dark, rounded Neovim UI.
- Real-time mpv/FFmpeg `showcqt` spectrum in mpv's own video window (separate from the Neovim dashboard).
- Custom 10-band EQ, low-pass/high-pass/band-pass filters, local picker, FIFO queue, yt-dlp search/download, and playback controls.
- TypeScript helper (`dist/lyrics.js`) handles search, TTML/LRC parsing, and translation. Direct lrc.red TTML fetch retains a curl fallback; expanded search/translation needs Node.js.

## Requirements

- Neovim **0.10+** (uses `vim.system`).
- **mpv** for playback. On Unix-like systems the plugin communicates with mpv over its JSON IPC socket.
- **yt-dlp** for general search, downloads, and JioSaavn permalink extraction; install **FFmpeg** for audio extraction, EQ/filter processing, and `showcqt` spectrum visualization.
- **Node.js 18+** for lyrics catalog search, translation, and the TypeScript helper. `curl` remains sufficient for the direct lrc.red ISRC/TTML path if Node is unavailable.
- Optional: Telescope.nvim for fuzzy local picking. The built-in picker remains available without it.
- Optional translator: a local LibreTranslate server (default `http://127.0.0.1:5000`) or any compatible endpoint you configure.

## Install

With lazy.nvim:

```lua
{
  "getwizardo/player.nvim",
  config = function()
    require("player").setup({
      download_dir = vim.fn.expand("~/Music"),
      eq = { enabled = false },
    })
  end,
}
```

With a native package manager, put this repository on `runtimepath`, then call `require("player").setup()` in your config. `plugin/player.lua` registers the `:Player*` commands automatically.

The TypeScript source is in `src/lyrics.ts`, with its compiled helper in `dist/lyrics.js`. To rebuild or run its parser tests:

```sh
npm ci
npm run build
npm test
```

## Usage

```vim
:Player                       " Apple Music-inspired dashboard
:Player path/to/song.flac     " play local file
:PlayerPlay https://...       " play an mpv-supported URL
:PlayerQueue                  " pick a local file and enqueue it
:PlayerSearch                 " search with yt-dlp
:PlayerSearch artist song     " search yt-dlp sources
:PlayerJioSaavn artist song    " search/play a JioSaavn result
:PlayerDownload https://...   " extract/download audio
:PlayerLyricsSearch song name " search LRCLIB + JioSaavn catalog
:PlayerTranslate vi            " translate the open karaoke lyrics
:PlayerVisualize               " live FFmpeg spectrum in mpv
:PlayerPause
:PlayerNext
:PlayerPrev
:PlayerStop
:PlayerEQ                     " enter ten comma-separated dB gains
:PlayerEQ on                  " enable current EQ curve
:PlayerEQ off
:PlayerFilter                " choose a filter and frequency
:PlayerFilter lowpass         " enable a low-pass filter
:PlayerFilter off
:PlayerLyrics                 " use mpv's ISRC tag, or prompt for an ISRC
:PlayerLyrics GBUM71029604    " fetch lrc.red TTML for a known ISRC
:PlayerStatus
:PlayerQuit
```

`:PlayerEQ` accepts ten values in ascending frequency order: 31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, and 16000 Hz. Values are clamped/validated within −12 to +12 dB. The filter command accepts `lowpass`, `highpass`, `bandpass`, or `off` and validates its frequency before applying it.

Example setup with custom initial values and keymaps:

```lua
require("player").setup({
  default_volume = 65,
  download_dir = vim.fn.expand("~/Music"),
  eq = {
    enabled = true,
    bands = { 2, 1, 0, -1, 0, 1, 2, 1, 0, -1 },
  },
  filter = { enabled = false, type = "off", frequency = 1000, width = 1 },
  keymaps = {
    play_pause = "<leader>pp",
    next = "]n",
    previous = "[n",
    lyrics = "<leader>ly",
  },
})
```

## Streaming and service integrations

The plugin delegates URL playback and extraction to mpv and yt-dlp. It does **not** implement private service APIs or bypass login, subscription, DRM, or playback restrictions. A service URL works only if mpv/yt-dlp supports it and the user's account/session is authorized as required. For example, Spotify playback is not the same as opening a public web URL: Spotify's Web API uses OAuth scopes and its player endpoints control an authorized Connect device. This plugin does not currently ship a Spotify account/player adapter.

The search and download commands pass each argument directly to the child process (no shell interpolation), and download only accepts HTTP(S) URLs. Only download content you have the right to save and follow each site's terms.

## Lyrics, karaoke, and translation

`:PlayerLyricsSearch` searches LRCLIB and the JioSaavn song catalog, then prefers lrc.red TTML for search records with an ISRC and otherwise uses LRCLIB synced LRC/plain text. JioSaavn is an unofficial catalog integration; selecting a JioSaavn item for lyrics resolves the song against LRCLIB metadata when available. Its own lyric availability varies. Direct `:PlayerLyrics <ISRC>` uses the documented lrc.red `.ttml` route; the plugin does not invent an lrc.red search endpoint. TTML timed spans become word karaoke; line-timed LRC highlights the active line.

The lyric float follows playback. Press `t` to translate and `f` to toggle auto-follow. Translation uses the configurable LibreTranslate-compatible endpoint. The default is local-only; if you configure a remote endpoint, lyric text is sent to that translation service. It refuses to attach a translation if the translator changes the number of lyric lines, avoiding timing corruption. Translation quality and available languages depend on that provider.

## Visualization and JioSaavn

`:PlayerVisualize` enables mpv's live `showcqt` spectrum via its FFmpeg complex-filter graph. It opens a separate mpv video window; it requires an FFmpeg build that includes `showcqt` and a usable mpv video output. The dashboard also renders a live progress bar and the configured EQ curve.

`:PlayerJioSaavn` searches JioSaavn catalog metadata through the configurable `jiosaavn_api` wrapper and plays the selected public song permalink using yt-dlp's JioSaavn extractor. This catalog endpoint is **unofficial third-party infrastructure** and can change or go offline. The plugin does not consume its returned direct download links or decrypt media. Follow JioSaavn's terms and your local copyright rules.

## Configuration

`require("player").setup(opts)` deep-merges these options with defaults:

| Option | Default | Purpose |
| --- | --- | --- |
| `mpv` | `"mpv"` | mpv executable |
| `yt_dlp` | `"yt-dlp"` | yt-dlp executable |
| `node` | `"node"` | Node executable for search/translation helper |
| `jiosaavn_api` | `"https://saavn.sumit.co"` | Unofficial JioSaavn metadata-search wrapper base URL |
| `translator.url` | `"http://127.0.0.1:5000"` | LibreTranslate-compatible endpoint base |
| `translator.api_key` | `""` | Optional translation service API key |
| `translator.source` | `"auto"` | Source language code for translation |
| `use_telescope` | `true` | Use Telescope if available |
| `download_dir` | `~/Music` | yt-dlp output folder |
| `default_volume` | `75` | Initial mpv volume |
| `eq` | disabled, ten 0 dB bands | Equalizer state |
| `filter` | disabled | Filter type, frequency, and width |
| `mpv_args` | `{}` | Extra mpv command-line arguments |
| `keymaps` | `<Space>`, `]n`, `[n`, `l` | Playback/lyrics mappings |

See [`doc/player.txt`](doc/player.txt) for the Vim help page.

## Implementation references

These upstream references shaped the integration boundaries and commands:

- [lrc.red API docs](https://lrc.red/docs) document direct format URLs such as `/s/<id>.ttml`; the plugin uses that direct route rather than inventing a search API. [LRCLIB API docs](https://lrclib.net/docs) document its searchable `/api/search` records, LRC timestamps, and responsible-client requirements.
- [JioSaavn API docs](https://saavn.sumit.co/docs) describe an **unofficial** catalog wrapper and song-search response; the plugin uses catalog metadata/permalinks only. [yt-dlp's JioSaavn extractor](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/jiosaavn.py) is used to open the permalink when supported.
- [Neovim Lua guide](https://neovim.io/doc/user/lua-guide/), [`vim.system()` reference](https://neovim.io/doc/user/lua/#vim.system), and [floating-window API](https://neovim.io/doc/user/api/#api-floatwin) inform async process handling, UI, and timed extmark highlighting.
- [W3C TTML Karaoke extension](https://w3c.github.io/tt-module-karaoke/) describes timed spans for word emphasis. [mpv's JSON IPC and `lavfi-complex`](https://mpv.io/manual/stable/#json-ipc) underpin player control and the spectrum. [FFmpeg audio filters](https://ffmpeg.org/ffmpeg-filters.html#equalizer) define the parametric EQ stages.
- [LibreTranslate API usage](https://docs.libretranslate.com/guides/api_usage/) documents `/translate`; the default endpoint is localhost so lyric text stays local unless a remote endpoint is configured.
- [yt-dlp README](https://github.com/yt-dlp/yt-dlp#readme) documents JSON metadata, output templates, audio extraction, and extractor usage. [Telescope.nvim](https://github.com/nvim-telescope/telescope.nvim) is an optional picker.
- [Spotify authorization](https://developer.spotify.com/documentation/web-api/concepts/authorization) and [Player API](https://engineering.atspotify.com/2022/04/spotifys-player-api) explain why a public URL is not a general-purpose authorized stream. No Spotify credentials or DRM workarounds are included.
