# player.nvim

A music player for Neovim, **written entirely in TypeScript**. Its centered, rounded dashboard and karaoke float use a dark Apple Music-inspired palette, animated now-playing/progress, and timed line/word highlighting. Neovim supplies the UI and controls; **mpv** does the actual decoding and playback.

The Neovim side is compiled from TypeScript to Lua with [typescript-to-lua](https://github.com/TypeScriptToLua/TypeScriptToLua); the generated `lua/` and `plugin/` files are committed, so the plugin can be installed without a Node.js toolchain. The lyrics helper is a small Node.js CLI that is compiled to `dist/` and committed as well.

## Features

- Local files, streaming URLs and yt-dlp-supported sources, including JioSaavn links through yt-dlp's JioSaavn extractor.
- JioSaavn catalog search and play by its public song permalink (the search API is an unofficial third-party wrapper; no direct media URL extraction or DRM workaround is implemented here). The permalink is resolved with yt-dlp before it is played.
- One search over several sources: yt-dlp (and everything it supports) and the JioSaavn catalog are asked at the same time, and the results are merged into one list.
- LRCLIB, MusicBrainz and JioSaavn-catalog lyrics search, plus the iTunes catalogue for the tracks no lyric service knows; line-synced LRC and plain-lyrics fallback.
- Direct ISRC-based TTML from [lrc.red](https://lrc.red); the word level timings of the document drive the karaoke highlight.
- Karaoke view with word-level TTML timing where supplied, current-line follow, optional translation rows and a persistent dark, rounded Neovim UI.
- Real-time mpv/FFmpeg `showcqt` spectrum in mpv's own video window (separate from the Neovim dashboard).
- Custom 10-band EQ, low-pass/high-pass/band-pass filters, local picker, selectable in-memory queue, shuffle/history, repeat modes, yt-dlp search/download, and playback controls.
- TypeScript helper (`dist/lyrics.js`) handles search, TTML/LRC parsing, and translation. Direct lrc.red TTML fetch retains a curl fallback; expanded search/translation needs Node.js.
- The whole plugin is written in TypeScript: the Neovim side is compiled to Lua and committed, the helper is compiled to JavaScript and committed. Both are covered by an automated test suite.

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
  cmd = {
    "Player", "PlayerPlay", "PlayerPause", "PlayerStop", "PlayerNext", "PlayerPrev",
    "PlayerQueue", "PlayerQueueAdd", "PlayerQueueList", "PlayerQueueClear",
    "PlayerShuffle", "PlayerRepeat", "PlayerSearch", "PlayerDownload", "PlayerEQ",
    "PlayerFilter", "PlayerLyrics", "PlayerLyricsSearch", "PlayerTranslate",
    "PlayerJioSaavn", "PlayerVisualize", "PlayerStatus", "PlayerQuit",
  },
  config = function()
    require("player").setup({
      download_dir = vim.fn.expand("~/Music"),
      eq = { enabled = false },
    })
  end,
}
```

With a native package manager, put this repository on `runtimepath`, then call `require("player").setup()` in your config. `plugin/player.lua` registers the `:Player*` commands automatically.

Everything that is needed at runtime is committed: the compiled Lua plugin (`lua/`, `plugin/`) and the compiled helper (`dist/`). Node.js is only needed at runtime for the lyric search and the translation, not to install the plugin.

### Building from source

The repository is a TypeScript project; the compiled output is committed.

| Source | Compiled to | Purpose |
| --- | --- | --- |
| `src/lua/player/*.ts` | `lua/player/*.lua` | The plugin itself |
| `src/plugin/player.ts` | `plugin/player.lua` | The `:Player*` commands |
| `src/node/*.ts` | `dist/*.js` | The lyrics/search/translation helper |
| `src/tests/*.ts` | `.tmp/test/` | The test suite |

```sh
npm ci
npm run build      # compile the Lua plugin and the Node.js helper
npm run typecheck  # check the TypeScript sources
npm test           # run the Lua and the Node.js tests
```

`npm run check:generated` rebuilds everything and fails when the committed output is out of date.

The Lua side is tested with a small harness (`src/tests/lua-harness.ts`) that stubs the Neovim API and runs the generated code in a real Lua interpreter; the tests cover the queue, the configuration, the TTML/LRC parsers and the public API.

## Usage

```vim
:Player                       " Apple Music-inspired dashboard
:Player path/to/song.flac     " play local file
:PlayerPlay https://...       " play an mpv-supported URL
:PlayerQueue                  " pick a local file and enqueue it
:PlayerQueueAdd path/song.flac " enqueue a file or URL
:PlayerQueueList               " browse and play the queue
:PlayerQueueClear              " stop and clear the queue
:PlayerShuffle                 " toggle shuffle (also accepts on/off)
:PlayerRepeat                  " cycle off → queue → track
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

`:PlayerEQ` accepts ten values in ascending frequency order: 31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, and 16000 Hz. Values are clamped/validated within −12 to +12 dB. The filter command accepts `lowpass`, `highpass`, `bandpass`, or `off` and validates its frequency before applying it. `:PlayerQueueList` opens a selectable queue; choose an entry to play it. `:PlayerShuffle [on|off]` toggles random next-track selection (and keeps a back-history), while `:PlayerRepeat [off|queue|track]` cycles or sets end-of-track repeat behavior. `:PlayerQueueClear` stops playback and removes the queue.

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

## When nothing plays

The player reports what mpv answers instead of staying silent:

- `mpv could not play <source>: <reason>` — mpv refused the file or the URL.
- `mpv could not load the file: <reason>` — the file was found but could not be decoded.
- `Could not reach the mpv IPC socket` — the JSON IPC socket of mpv is not reachable. The plugin then starts a plain mpv process, so the music plays but the plugin cannot control it.
- `Not a readable local file or a URL` — the path does not exist, or it is not a URL.
- `That file is empty` — the file has no content.

A link to a web page (a JioSaavn permalink, for example) is resolved with yt-dlp before it is handed to mpv; a direct media file is played as it is. Run `:checkhealth player` to see what is installed, where the socket lives and how the player is configured.

## Streaming and service integrations

The plugin delegates URL playback and extraction to mpv and yt-dlp. It does **not** implement private service APIs or bypass login, subscription, DRM, or playback restrictions. A service URL works only if mpv/yt-dlp supports it and the user's account/session is authorized as required. For example, Spotify playback is not the same as opening a public web URL: Spotify's Web API uses OAuth scopes and its player endpoints control an authorized Connect device. This plugin does not currently ship a Spotify account/player adapter.

The search and download commands pass each argument directly to the child process (no shell interpolation), and download only accepts HTTP(S) URLs. Only download content you have the right to save and follow each site's terms.

## Lyrics, karaoke, and translation

`:PlayerLyricsSearch` searches LRCLIB, MusicBrainz, the iTunes catalogue and the JioSaavn song catalog at the same time; the results are merged and de-duplicated. JioSaavn is an unofficial catalog integration; selecting one of its songs looks up lyrics through the other services, and its own lyric availability varies. lrc.red is keyed by ISRC and has no search API of its own, so it is reached through the ISRC of a match: LRCLIB and MusicBrainz know the ISRC of a recording, and the iTunes results are matched against LRCLIB by title and artist. The lrc.red document is a TTML file, so its word level timings drive the karaoke highlight; when lrc.red does not know the recording, the synced LRC or the plain lyrics of LRCLIB are used. An explicit `:PlayerLyrics <ISRC>` request fetches the TTML of lrc.red directly.

TTML timed spans become word karaoke; line-timed LRC highlights the active line.

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
