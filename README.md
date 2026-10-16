# player.nvim

Music playback and word-synced lyrics inside Neovim.

Every line of this plugin is written in **TypeScript** (`src/player/**.ts`) and
compiled to Lua with [typescript-to-lua](https://github.com/TypeScriptToLua/TypeScriptToLua).
The Lua files in `lua/` and `plugin/` are build output — they are committed so
the plugin installs without a toolchain, but they are never edited by hand.

Neovim draws the UI and handles the keys; **mpv** does the decoding and the
audio. Lyrics come from [lrc.red](https://lrc.red) (word-synced TTML),
[LRCLIB](https://lrclib.net) and the JioSaavn catalogue, all key-less.

```
:Player blinding lights        search every enabled source and open the dashboard
:PlayerLyrics                  word-synced lyrics for whatever is playing
```

## Features

- **Search, then play.** One query fans out to yt-dlp (YouTube, YouTube Music,
  SoundCloud), the Internet Archive, Audius, JioSaavn and, optionally, any
  Invidious instance. Results are de-duplicated and grouped by source.
- **Playback that reports why it failed.** mpv is driven over its JSON IPC
  socket; commands issued before the socket is up are queued and flushed on
  connect, mpv's own stderr is captured, and `:PlayerDiagnostics` prints it.
- **Karaoke float with real word timing.** lrc.red TTML is parsed word by word:
  the sung word is highlighted, finished words dim, and the active line follows
  playback. `[` / `]` jump playback to the previous/next line.
- **Three lyric sources, searched at once**, ranked by provider then by title
  similarity — not just first-match-wins.
- **Direct ISRC lookup** with `:PlayerLyricsIsrc USUG11904206`.
- **Translation** of the open lyrics through any LibreTranslate endpoint, kept
  line-aligned 1:1 with the source.
- **LRC export** of any set (`lyrics.toLrc`), handy for saving beside the audio.
- Dark, rounded floats; a transport bar with progress; no dependency on
  Telescope, plenary, or any other plugin.

## Requirements

| Tool | Needed for |
| --- | --- |
| Neovim 0.10+ | `vim.system`, `vim.uv`, extmarks |
| `mpv` | all playback |
| `curl` (or `wget`) | every HTTP request — Neovim has no TLS client |
| `yt-dlp` | the `ytdlp`/`youtube`/`ytmusic`/`soundcloud` sources and `:PlayerDownload` |
| `ffmpeg` | the `showcqt` visualizer and the EQ/filter chain |

Nothing else. There is no Node.js runtime dependency: the TypeScript is
compiled at development time and shipped as Lua.

## Install

lazy.nvim:

```lua
{
  "getwizardo/player.nvim",
  cmd = { "Player", "PlayerLyrics", "PlayerKaraoke", "PlayerToggle", "PlayerNext", "PlayerPrev" },
  opts = {
    search = { sources = { "ytdlp", "archive", "audius" } },
    lyric = { sources = { "lrc.red", "lrclib", "jiosaavn" } },
  },
}
```

The commands are registered by `plugin/player.lua`, so the plugin works even if
you never call `setup()`.

## Commands

| Command | What it does |
| --- | --- |
| `:Player` | open the dashboard |
| `:Player <query>` / `:PlayerSearch <query>` | search every enabled music source |
| `:PlayerUrl <url>` | play a URL or local file directly |
| `:PlayerToggle` `:PlayerNext` `:PlayerPrev` `:PlayerStop` | transport |
| `:PlayerSeek <seconds>` | seek relatively (`:PlayerSeek -15` rewinds) |
| `:PlayerVolume [0-130]` | show or set the volume |
| `:PlayerVisual` | toggle mpv's `showcqt` spectrum |
| `:PlayerLyrics` | lyrics for the current track |
| `:PlayerLyricsSearch <query>` | search the lyric catalogues |
| `:PlayerLyricsIsrc <ISRC>` | word-synced TTML straight from lrc.red |
| `:PlayerTranslate [lang]` | translate the open lyrics |
| `:PlayerKaraoke` | toggle the karaoke float |
| `:PlayerDownload` | download the selected result with yt-dlp |
| `:PlayerStatus` / `:PlayerSources` | queue, volume, configured sources |
| `:PlayerDiagnostics` | mpv's own output |
| `:PlayerDoctor` | check curl, mpv, yt-dlp and the lyric services |
| `:PlayerClose` | close the floats (playback continues) |

### Keys

Dashboard (results pane): `<CR>` play · `<C-y>` lyrics · `j`/`k` move ·
`<Tab>`/`<S-Tab>` jump between sources · `/` filter · `1`–`9` play by index ·
`r` repeat the last search · `q` close.

Now-playing pane: `<Space>` play/pause · `[`/`]` previous/next · `h`/`l` seek ·
`-`/`+` volume · `v` visualizer · `y` lyrics · `t` translate · `s` stop.

Karaoke float: `[`/`]` seek to the previous/next lyric line · `t` translate ·
`f` toggle follow · `j`/`k` scroll (turns follow off) · `q` close.

Four global normal-mode maps are also created, defaulting to `<Leader>mp`
(play/pause), `<Leader>mn` (next), `<Leader>mb` (previous) and `<Leader>ml`
(lyrics). Set any of them to `""` to disable it:

```lua
require("player").setup({ keymaps = { play_pause = "", next = "", previous = "", lyrics = "" } })
```

## Configuration

```lua
require("player").setup({
  mpv = "mpv",
  yt_dlp = "yt-dlp",
  http = "curl",              -- falls back to wget when curl is missing
  mpv_args = {},              -- extra argv for the mpv process
  default_volume = 75,
  seek_step = 5,
  download_dir = "~/Music",

  search = {
    -- pick from: ytdlp youtube ytmusic soundcloud archive audius invidious jiosaavn
    sources = { "ytdlp", "archive", "audius" },
    limit = 12,
    youtube = "ytsearch",
    invidious = "",           -- e.g. "https://inv.nadeko.net" to opt in
    audius = "https://api.audius.co",
    archive = "https://archive.org",
    timeout = 20,
  },

  lyric = {
    sources = { "lrc.red", "lrclib", "jiosaavn" },
    auto = true,              -- refresh an open karaoke float per track
    follow = true,            -- keep the active line centred
    lrc_red = "https://lrc.red",
    lrclib = "https://lrclib.net",
    jiosaavn_api = "https://saavn.sumit.co",  -- unofficial wrapper; "" disables
    timeout = 20,
  },

  translator = { url = "http://127.0.0.1:5000", api_key = "", source = "auto" },

  eq = { enabled = false, bands = { 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 } },
  filter = { enabled = false, type = "off", frequency = 1000, width = 1 },
})
```

`eq` and `filter` build an mpv `af` chain that is re-applied to every track.
`:PlayerVisual` uses mpv's `showcqt` filter, which needs ffmpeg.

## How it works

```
src/player/
  init.ts        orchestration: search results -> queue -> mpv -> UI
  commands.ts    :Player* commands and global keymaps
  ui.ts          dashboard: results, now-playing, transport bar
  karaoke.ts     lyric float and the word-highlight extmarks
  mpv.ts         JSON IPC client (queue, observers, diagnostics)
  http.ts        curl/wget transport driven by vim.system
  search.ts      music source fan-out and de-duplication
  lyrics.ts      lyric source fan-out, ISRC resolution, LRC export
  translate.ts   LibreTranslate, kept line-aligned
  format/        xml.ts (real nesting), ttml.ts (word sync), lrc.ts
  providers/     lrcred.ts, lrclib.ts, jiosaavn.ts
  sources/       ytdlp.ts, archive.ts, audius.ts, invidious.ts
  util.ts        the only place Lua patterns appear
plugin-src/player.ts   ->  plugin/player.lua
```

Two constraints of the TypeScript→Lua compile shape the code:

- **No `async`/`await`.** Every I/O function takes a callback as its last
  argument, so the whole plugin is continuation-passing style.
- **No `RegExp`.** Text matching uses Lua patterns, wrapped by `util.ts`
  (`match`, `matchList`, `matchPairs`, `indexOf`, `replace`, …) so no module has
  to deal with Lua's multi-return values. Note that Lua patterns have no
  alternation: `(a|b)` matches the literal text `a|b`.

## Development

```sh
npm install
npm run build       # tstl: src/player -> lua/, plugin-src -> plugin/
npm run typecheck   # tsc --noEmit for both projects
npm test            # build, then run the Lua suite under LuaJIT
```

`npm test` needs a Lua 5.1 interpreter: `luajit`, `lua5.1` or `lua` on `PATH`,
or `LUA_BIN=/path/to/luajit`.

The suite runs the **generated Lua**, not a reimplementation. The two harness
files (`tests/lua/vim-shim.lua`, `tests/lua/run.lua`) are Lua on purpose: the
shim *is* the stand-in for Neovim, so it has to exist before any TypeScript can
run. Everything shipped to users is TypeScript.

A mock HTTP server
(`tests/node/server.ts`) serves responses recorded from the real lrc.red,
LRCLIB, JioSaavn, Audius and Internet Archive APIs, so the plugin really shells
out to `curl`, really decodes JSON and really parses the 17 KB lrc.red TTML
fixture. `tests/lua/vim-shim.lua` stands in for Neovim: it records extmarks, so
the tests assert that the sung word is highlighted at the right byte column.

What the suite cannot cover here: it needs a real Neovim, so float positioning,
`winhl` remapping and actual key dispatch are not exercised. Run
`:PlayerDoctor` after installing to check your own setup.

## Credits

lrc.red and LRCLIB are free, key-less lyric catalogues; both ask that clients
identify themselves, which `http.ts` does with
`user-agent: player.nvim/1.0 (https://github.com/getwizardo/player.nvim)`.
The JioSaavn search wrapper is a third-party service — point
`lyric.jiosaavn_api` at your own instance, or set it to `""` to disable it.
