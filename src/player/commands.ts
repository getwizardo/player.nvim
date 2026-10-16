/**
 * User commands and global keymaps.
 *
 * `register()` is called from `plugin/player.lua` at startup; it boots the
 * plugin with `vim.g.player_nvim` when the user never called `setup()` so the
 * commands work either way.
 */

import { get as getOptions } from "./config";
import * as init from "./init";
import * as karaoke from "./karaoke";
import * as ui from "./ui";
import { replace, trim, warn } from "./util";

let registered = false;

/** Boot with defaults (or `vim.g.player_nvim`) unless the user ran setup(). */
function boot(): void {
  if (init.isConfigured()) return;
  init.setup(vim.g.player_nvim);
}

function define(name: string, fn: (args: NvimCommandArgs) => void, opts: NvimUserCommandOptions): void {
  vim.api.nvim_create_user_command(name, (args) => {
    boot();
    fn(args);
  }, opts);
}

/** Join `:Command arg1 arg2 …` back into one string. */
function words(args: NvimCommandArgs): string {
  return trim(args.fargs.join(" "));
}

/**
 * Bind the global keymaps.
 *
 * `<Leader>` is resolved here rather than by Neovim so the maps keep working
 * even when `vim.g.mapleader` is set after this plugin has loaded. An empty
 * string disables a binding.
 */
function defineKeymaps(): void {
  const keys = getOptions().keymaps;
  // A space is a perfectly good leader, so only fall back when it is unset.
  const configured = vim.g.mapleader as string | undefined;
  const leader = configured === undefined || configured === "" ? "\\" : configured;
  const map = (lhs: string, rhs: () => void, description: string): void => {
    const target = trim(lhs);
    if (target === "") return;
    const expanded = replace(replace(target, "<[Ll]eader>", leader), "<leader>", leader);
    vim.keymap.set("n", expanded, rhs, { silent: true, desc: description });
  };
  map(keys.play_pause, () => {
    if (!ui.isOpen() && !karaoke.isOpen()) {
      ui.open();
      return;
    }
    init.togglePlay();
  }, "player: play/pause (open the dashboard when idle)");
  map(keys.next, () => init.next(), "player: next track");
  map(keys.previous, () => init.previous(), "player: previous track");
  map(keys.lyrics, () => init.lyricsForCurrent(), "player: lyrics for the current track");
}

/** Create every `:Player*` command. Safe to call more than once. */
export function register(): void {
  if (registered) return;
  registered = true;
  boot();

  define(
    "Player",
    (args) => {
      const query = words(args);
      if (query === "") {
        ui.open();
        return;
      }
      init.searchTracks(query);
    },
    { nargs: "*", desc: "Open the player dashboard, or search every enabled source" },
  );
  define("PlayerSearch", (args) => init.searchTracks(words(args)), { nargs: "+", desc: "Search every enabled music source" });
  define("PlayerUrl", (args) => init.playUrl(args.fargs[0] ?? ""), { nargs: 1, desc: "Play a URL or local file directly" });
  define("PlayerNext", () => init.next(), { desc: "Next track in the queue" });
  define("PlayerPrev", () => init.previous(), { desc: "Previous track in the queue" });
  define("PlayerToggle", () => init.togglePlay(), { desc: "Play / pause" });
  define("PlayerStop", () => init.stop(), { desc: "Stop playback" });
  define(
    "PlayerSeek",
    (args) => {
      const seconds = tonumber(args.fargs[0] ?? "");
      if (seconds === undefined) {
        warn(":PlayerSeek needs a number of seconds, e.g. :PlayerSeek -15");
        return;
      }
      init.seekRelative(seconds);
    },
    { nargs: 1, desc: "Seek by N seconds (negative to rewind)" },
  );
  define(
    "PlayerVolume",
    (args) => {
      const raw = trim(args.fargs[0] ?? "");
      if (raw === "") {
        init.nudgeVolume(0);
        return;
      }
      const level = tonumber(raw);
      if (level === undefined) {
        warn(":PlayerVolume needs a number, e.g. :PlayerVolume 60");
        return;
      }
      init.setVolume(level);
    },
    { nargs: "?", desc: "Show or set the volume (0-130)" },
  );
  define("PlayerVisual", () => init.toggleVisualizer(), { desc: "Toggle the audio visualizer" });
  define("PlayerDownload", () => init.downloadSelection(), { desc: "Download the selected result with yt-dlp" });
  define("PlayerStatus", () => init.status(), { desc: "Show playback, queue and diagnostics" });
  define("PlayerSources", () => init.sources(), { desc: "List the configured music and lyric sources" });
  define(
    "PlayerLyrics",
    (args) => {
      const query = words(args);
      if (query === "") {
        init.lyricsForCurrent();
        return;
      }
      init.lyricsSearch(query);
    },
    { nargs: "*", desc: "Lyrics for the current track, or search by query" },
  );
  define("PlayerLyricsSearch", (args) => init.lyricsSearch(words(args)), { nargs: "+", desc: "Search lrc.red / LRCLIB / JioSaavn for lyrics" });
  define("PlayerLyricsIsrc", (args) => init.lyricsByIsrc(args.fargs[0] ?? ""), { nargs: 1, desc: "Fetch lrc.red word-synced lyrics by ISRC" });
  define(
    "PlayerTranslate",
    (args) => {
      const target = trim(args.fargs[0] ?? "");
      init.translateLyrics(target === "" ? undefined : target);
    },
    { nargs: "?", desc: "Translate the open lyrics" },
  );
  define(
    "PlayerKaraoke",
    () => {
      if (karaoke.isOpen()) {
        karaoke.close();
        return;
      }
      init.lyricsForCurrent();
    },
    { desc: "Toggle the karaoke float for the current track" },
  );
  define(
    "PlayerClose",
    () => init.close(),
    { desc: "Close every player float (playback continues)" },
  );
  define("PlayerDiagnostics", () => init.diagnostics(), { desc: "Show mpv's own output — useful when a track will not play" });
  define("PlayerDoctor", () => init.doctor(), { desc: "Check curl, mpv, yt-dlp and the lyric services" });

  defineKeymaps();
}
