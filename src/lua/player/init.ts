import { setActions } from "./actions";
import type { UrlAction, VoidAction } from "./actions";
import { setup as applyOptions, isFilterType, isRepeatMode, options } from "./config";
import { formatClock, sourceLabel } from "./format";
import { helperCall } from "./helper";
import { attempt, indexOf, matchCapture, push, split } from "./lua-util";
import * as lyrics from "./lyrics";
import * as mpv from "./mpv";
import * as queue from "./queue";
import * as ui from "./ui";
import type { PlayerOptions, QueueInfo, RepeatMode } from "./types";

/**
 * The public API of player.nvim.
 *
 * Every function is also available as a `:Player*` command, see
 * `plugin/player.ts`.
 */

/** A search result of the yt-dlp or of the JioSaavn catalog search. */
/** @noSelf */
export interface SearchEntry {
  title: string;
  uploader: string;
  url: string;
  duration?: number;
  /** The service the result comes from. */
  provider: string;
}

/** The callback of a media URL lookup. */
/** @noSelf */
export interface UrlResolver {
  /** @noSelf */
  (resolved?: string, error?: string): void;
}

/** The subset of the Telescope API that the plugin uses. */
/** @noSelf */
export interface TelescopePickers {
  new: (opts: unknown, spec: unknown) => { find: () => void };
}

/** The subset of the Telescope API that the plugin uses. */
/** @noSelf */
export interface TelescopeFinders {
  new_oneshot_job: (cmd: string[], opts: unknown) => unknown;
}

/** The subset of the Telescope API that the plugin uses. */
/** @noSelf */
export interface TelescopeConfig {
  values: { file_sorter: (opts: unknown) => unknown };
}

/** The subset of the Telescope API that the plugin uses. */
/** @noSelf */
export interface TelescopeActions {
  close: (bufnr: number) => void;
}

/** The subset of the Telescope API that the plugin uses. */
/** @noSelf */
export interface TelescopeActionState {
  get_selected_entry: () => { value: string } | undefined;
}

function notify(message: string, level?: number): void {
  vim.notify(message, level === undefined ? vim.log.levels.INFO : level, { title: "player.nvim" });
}

/**
 * Resolve a source into something mpv can play.
 *
 * Local files are expanded (`~`, relative paths) and URLs are accepted as
 * they are. Anything that could be mistaken for a command line option is
 * rejected.
 */
export function resolveSource(source: string): string | undefined {
  if (type(source) !== "string" || source === "") {
    return undefined;
  }
  const trimmed = string.gsub(source, "^%s*(.-)%s*$", "%1");
  if (trimmed === "" || string.sub(trimmed, 1, 1) === "-") {
    return undefined;
  }
  if (string.find(trimmed, "^[%a][%w+.-]*://") !== undefined) {
    return trimmed;
  }
  const expanded = vim.fn.expand(trimmed);
  if (vim.fn.filereadable(expanded) === 1) {
    return vim.fn.fnamemodify(expanded, ":p");
  }
  return undefined;
}

function playIndex(index: number, fromHistory: boolean): void {
  const state = queue.state();
  if (index < 0 || index >= state.items.length) {
    return;
  }
  if (state.current >= 0 && state.current !== index && !fromHistory) {
    queue.recordHistory(state, state.current);
  }
  state.current = index;
  mpv.play(state.items[index].source);
  notify("Playing " + state.items[index].label);
}

/** Start playback of a local file or URL. */
export function play(source: string): void {
  const resolved = resolveSource(source);
  if (resolved === undefined) {
    notify("Not a readable local file or a URL: " + tostring(source), vim.log.levels.ERROR);
    return;
  }
  if (string.find(resolved, "^[%a][%w+.-]*://") === undefined && vim.fn.getfsize(resolved) === 0) {
    notify("That file is empty: " + resolved, vim.log.levels.ERROR);
    return;
  }
  const state = queue.state();
  queue.clearQueue(state);
  queue.addItem(state, resolved);
  playIndex(0, false);
}

/** Add several sources to the queue and start playing when nothing plays. */
export function addToQueue(sources: string[]): void {
  const state = queue.state();
  let added = 0;
  for (let index = 0; index < sources.length; index += 1) {
    const resolved = resolveSource(sources[index]);
    if (resolved !== undefined) {
      queue.addItem(state, resolved);
      added += 1;
    }
  }
  if (added === 0) {
    notify("No playable files selected.", vim.log.levels.WARN);
    return;
  }
  notify("Added " + tostring(added) + " track(s) to the queue.");
  if (state.current < 0) {
    playIndex(state.items.length - added, false);
  }
}

function parseSearchResults(text: string): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const decoded = attempt((): unknown => {
    return vim.json.decode(text);
  });
  if (!decoded.ok || decoded.value === undefined || type(decoded.value) !== "table") {
    return entries;
  }
  const payload = decoded.value as Record<string, unknown>;
  const list = payload.entries;
  if (type(list) !== "table") {
    return entries;
  }
  const items = list as Record<string, unknown>[];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (type(item) !== "table") {
      continue;
    }
    const record = item;
    let url = "";
    if (typeof record.webpage_url === "string") {
      url = record.webpage_url;
    } else if (typeof record.original_url === "string") {
      url = record.original_url;
    } else if (typeof record.url === "string") {
      url = record.url;
    } else if (typeof record.id === "string") {
      url = "https://www.youtube.com/watch?v=" + record.id;
    }
    if (url === "") {
      continue;
    }
    const entry: SearchEntry = {
      title: typeof record.title === "string" ? record.title : typeof record.fulltitle === "string" ? record.fulltitle : "Untitled",
      uploader: typeof record.uploader === "string" ? record.uploader : typeof record.channel === "string" ? record.channel : "",
      url: url,
      provider: "yt-dlp",
    };
    if (typeof record.duration === "number") {
      entry.duration = record.duration;
    }
    entries[entries.length] = entry;
  }
  return entries;
}

/** Turn an answer of the helper into a list of records. */
function toRecords(value: unknown): Record<string, unknown>[] {
  if (type(value) !== "table") {
    return [];
  }
  const records: Record<string, unknown>[] = [];
  const source = value as Record<string, unknown>[];
  for (let index = 0; index < source.length; index += 1) {
    const entry = source[index];
    if (type(entry) === "table") {
      records[records.length] = entry as Record<string, unknown>;
    }
  }
  return records;
}

function loadModule<T>(name: string): T | undefined {
  const loaded = attempt((): unknown => {
    return require(name);
  });
  if (!loaded.ok || loaded.value === undefined) {
    return undefined;
  }
  return loaded.value as T;
}

/** Pick a local audio file, optionally adding it to the queue. */
export function pickLocal(append?: boolean): void {
  const add = append === true;
  if (options().use_telescope) {
    const pickers = loadModule<TelescopePickers>("telescope.pickers");
    const finders = loadModule<TelescopeFinders>("telescope.finders");
    const conf = loadModule<TelescopeConfig>("telescope.config");
    const telescopeActions = loadModule<TelescopeActions>("telescope.actions");
    const actionState = loadModule<TelescopeActionState>("telescope.actions.state");
    if (
      pickers !== undefined &&
      finders !== undefined &&
      conf !== undefined &&
      telescopeActions !== undefined &&
      actionState !== undefined
    ) {
      const cwd = vim.fn.getcwd();
      const hasFd = vim.fn.executable("fd") === 1;
      const command = hasFd ? ["fd", "--type", "f", "--hidden", "--exclude", ".git"] : ["find", ".", "-type", "f"];
      pickers.new(
        {},
        {
          prompt_title: add ? "Queue local audio" : "Play local audio",
          finder: finders.new_oneshot_job(command, { cwd: cwd }),
          sorter: conf.values.file_sorter({}),
          attach_mappings: (_promptBuffer: number, map: (mode: string, key: string, action: () => void) => void): boolean => {
            const select = (enqueue: boolean): void => {
              const selection = actionState.get_selected_entry();
              telescopeActions.close(_promptBuffer);
              if (selection !== undefined) {
                const path = cwd + "/" + selection.value;
                if (enqueue) {
                  addToQueue([path]);
                } else {
                  play(path);
                }
              }
            };
            map("i", "<CR>", (): void => {
              select(add);
            });
            map("n", "<CR>", (): void => {
              select(add);
            });
            if (!add) {
              map("i", "<C-q>", (): void => {
                select(true);
              });
              map("n", "<C-q>", (): void => {
                select(true);
              });
            }
            return true;
          },
        },
      ).find();
      return;
    }
  }
  const files = vim.fn.globpath(vim.fn.getcwd(), "**/*", false, true);
  const audio: string[] = [];
  const supported: Record<string, boolean> = {
    mp3: true,
    m4a: true,
    aac: true,
    flac: true,
    wav: true,
    ogg: true,
    opus: true,
    wma: true,
    aiff: true,
    ape: true,
    alac: true,
    mp4: true,
    webm: true,
    mkv: true,
  };
  for (let index = 0; index < files.length && audio.length < 500; index += 1) {
    const path = files[index];
    const extension = matchCapture(path, "%.([%w]+)$");
    if (extension !== undefined && supported[string.lower(extension)] === true && vim.fn.filereadable(path) === 1) {
      audio[audio.length] = path;
    }
  }
  if (audio.length === 0) {
    notify("No audio files were found in the current working directory.", vim.log.levels.WARN);
    return;
  }
  vim.ui.select(
    audio,
    { prompt: add ? "Queue local audio" : "Play local audio" },
    (path: unknown): void => {
      if (typeof path === "string" && path !== "") {
        if (add) {
          addToQueue([path]);
        } else {
          play(path);
        }
      }
    },
  );
}

/** Add a file or URL to the queue. */
export function queueAdd(source: string): void {
  const resolved = resolveSource(source);
  if (resolved === undefined) {
    notify("Not a readable local file or a URL: " + tostring(source), vim.log.levels.ERROR);
    return;
  }
  addToQueue([resolved]);
}

/** Remove a track from the queue. */
export function queueRemove(index: number): void {
  const state = queue.state();
  if (!queue.removeItem(state, index)) {
    notify("There is no track at that position.", vim.log.levels.WARN);
    return;
  }
  notify("Removed the track from the queue.");
}

/** Show the queue and play the selected track. */
export function queueList(): void {
  const state = queue.state();
  if (state.items.length === 0) {
    notify("The player queue is empty.", vim.log.levels.WARN);
    return;
  }
  const items: string[] = [];
  for (let index = 0; index < state.items.length; index += 1) {
    const marker = index === state.current ? "▶" : " ";
    items[items.length] = string.format("%s %02d. %s", marker, index + 1, state.items[index].label);
  }
  vim.ui.select(
    items,
    { prompt: "Player queue · " + tostring(state.items.length) + " track(s)" },
    (_item: unknown, index: number): void => {
      if (typeof index === "number" && index >= 0) {
        playIndex(index, false);
      }
    },
  );
}

/** Stop playback and clear the queue. */
export function queueClear(): void {
  const state = queue.state();
  queue.clearQueue(state);
  if (mpv.isAlive()) {
    mpv.stop();
  }
  notify("Queue cleared.");
}

/** Turn shuffle on or off. */
export function toggleShuffle(enabled?: boolean): boolean {
  const state = queue.state();
  const wanted = enabled === undefined ? !state.shuffle : enabled === true;
  queue.setShuffle(state, wanted);
  notify("Shuffle " + (state.shuffle ? "on" : "off") + ".");
  return state.shuffle;
}

/** Set or cycle the repeat mode. */
export function cycleRepeat(mode?: string): RepeatMode {
  const state = queue.state();
  if (mode !== undefined && mode !== "" && !isRepeatMode(mode)) {
    notify("Repeat mode must be off, queue, or track.", vim.log.levels.ERROR);
    return state.repeat;
  }
  const result = queue.cycleRepeat(state, mode);
  notify("Repeat " + result + ".");
  return result;
}

/** Toggle the pause state. */
export function pause(): void {
  mpv.pause();
}

/** Stop playback. */
export function stop(): void {
  mpv.stop();
}

/** Play the next track of the queue. */
export function next(): void {
  const state = queue.state();
  const index = queue.nextIndex(state, (): number => {
    return math.random();
  });
  if (index === undefined) {
    notify("End of queue.", vim.log.levels.WARN);
    return;
  }
  playIndex(index, false);
}

/** Play the previous track, or restart the current one. */
export function previous(): void {
  const state = queue.state();
  const index = queue.previousIndex(state);
  if (index === undefined) {
    if (state.current >= 0) {
      mpv.seek(0);
    } else {
      notify("Nothing is playing.", vim.log.levels.WARN);
    }
    return;
  }
  playIndex(index, true);
}

/** Seek to an absolute position in seconds. */
export function seek(seconds: number): void {
  mpv.seek(seconds);
}

/** Change the volume by a delta. */
export function volume(delta?: number): void {
  mpv.getVolume((current: number): void => {
    let target = current + (delta === undefined ? 0 : delta);
    if (target < 0) {
      target = 0;
    }
    if (target > 100) {
      target = 100;
    }
    mpv.setVolume(target);
    notify("Volume " + tostring(math.floor(target + 0.5)) + "%.");
  });
}

/** Show what the player is doing. */
export function status(): void {
  const state = queue.state();
  if (!mpv.isAlive()) {
    notify("The player is stopped. Queue: " + tostring(state.items.length) + " track(s).");
    return;
  }
  mpv.property("media-title", (title: unknown): void => {
    mpv.property("time-pos", (position: unknown): void => {
      mpv.property("duration", (duration: unknown): void => {
        const name = typeof title === "string" && title !== "" ? title : "Playing";
        const time = typeof position === "number" ? formatClock(position) : "--:--";
        const total = typeof duration === "number" ? formatClock(duration) : "--:--";
        notify(
          name +
            "  " +
            time +
            "/" +
            total +
            "  ·  " +
            tostring(state.items.length) +
            " queued  ·  " +
            (state.shuffle ? "shuffle" : "ordered") +
            "  ·  repeat " +
            state.repeat,
        );
      });
    });
  });
}

/** The file extensions mpv can play without the help of yt-dlp. */
const MEDIA_EXTENSIONS: string[] = [
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
  "mka",
];

/** True when the URL points to a media file that mpv can play directly. */
export function isDirectMedia(url: string): boolean {
  const withoutQuery = string.gsub(url, "[?#].*$", "");
  const extension = matchCapture(withoutQuery, "%.([%w]+)$");
  if (extension === undefined) {
    return false;
  }
  return indexOf(MEDIA_EXTENSIONS, string.lower(extension)) >= 0;
}

/**
 * Ask yt-dlp for the direct media URL of a page.
 *
 * The catalog services return links to a web page; mpv needs the media URL
 * itself, so the link is resolved with yt-dlp before it is played.
 */
export function resolveWithYtDlp(url: string, callback: UrlResolver): void {
  if (vim.fn.executable(options().yt_dlp) !== 1) {
    callback(undefined, "yt-dlp is not installed.");
    return;
  }
  const args: string[] = [options().yt_dlp, "--no-warnings", "--no-playlist", "--get-url", url];
  vim.system(args, { text: true }, (result: VimSystemResult): void => {
    vim.schedule((): void => {
      if (result.code !== 0) {
        callback(undefined, result.stderr !== "" ? result.stderr : "yt-dlp could not resolve that link.");
        return;
      }
      const lines = split(result.stdout, "\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = string.gsub(lines[index], "^%s*(.-)%s*$", "%1");
        if (line !== "") {
          callback(line);
          return;
        }
      }
      callback(undefined, "yt-dlp did not return a media URL.");
    });
  });
}

/** Search the track services and play the selected result. */
export function search(query?: string): void {
  const run = (term: string): void => {
    if (vim.fn.executable(options().yt_dlp) !== 1) {
      notify("yt-dlp is required for search.", vim.log.levels.ERROR);
      return;
    }
    notify("Searching yt-dlp, iTunes and the JioSaavn catalog…");
    const entries: SearchEntry[] = [];
    let pending = 2;
    let failure = "";
    const finish = (): void => {
      pending -= 1;
      if (pending > 0) {
        return;
      }
      if (entries.length === 0) {
        notify(failure !== "" ? failure : "No search results.", vim.log.levels.WARN);
        return;
      }
      vim.ui.select(
        entries,
        {
          prompt: "Search results · yt-dlp + iTunes + JioSaavn",
          format_item: (item: unknown): string => {
            const entry = item as SearchEntry;
            let suffix = "";
            if (entry.duration !== undefined) {
              suffix = string.format(" [%d:%02d]", math.floor(entry.duration / 60), math.floor(entry.duration % 60));
            }
            return (
              "[" +
              entry.provider +
              "] " +
              entry.title +
              (entry.uploader === "" ? "" : " — " + entry.uploader) +
              suffix
            );
          },
        },
        (item: unknown): void => {
          if (item === undefined || item === null) {
            return;
          }
          const entry = item as SearchEntry;
          playUrl(entry.url);
        },
      );
    };
    const args: string[] = [
      options().yt_dlp,
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "ytsearch10:" + term,
    ];
    vim.system(args, { text: true }, (result: VimSystemResult): void => {
      vim.schedule((): void => {
        if (result.code !== 0) {
          failure = result.stderr !== "" ? result.stderr : "The yt-dlp search failed.";
        } else {
          const found = parseSearchResults(result.stdout);
          for (let index = 0; index < found.length; index += 1) {
            push(entries, found[index]);
          }
        }
        finish();
      });
    });
    helperCall(
      ["tracks", term],
      undefined,
      (value: unknown, error?: string): void => {
        if (error !== undefined) {
          failure = failure === "" ? error : failure;
        }
        const songs = toRecords(value);
        for (let index = 0; index < songs.length; index += 1) {
          const song = songs[index];
          const url = song.url;
          if (typeof url !== "string" || url === "") {
            continue;
          }
          const entry: SearchEntry = {
            title: typeof song.title === "string" ? song.title : "Unknown title",
            uploader: typeof song.artist === "string" ? song.artist : "",
            url: url,
            provider: typeof song.provider === "string" ? song.provider : "catalog",
          };
          if (typeof song.duration === "number") {
            entry.duration = song.duration;
          }
          push(entries, entry);
        }
        finish();
      },
      { PLAYER_JIOSAAVN_API: options().jiosaavn_api },
      30000,
    );
  };
  if (query !== undefined && query !== "") {
    run(query);
    return;
  }
  vim.ui.input({ prompt: "Search tracks via yt-dlp and the JioSaavn catalog: " }, (answer?: string): void => {
    if (answer !== undefined && answer !== "") {
      run(answer);
    }
  });
}

/** Download the audio of an HTTP(S) URL with yt-dlp. */
export function download(url?: string): void {
  const run = (target: string): void => {
    if (string.find(target, "^https?://") === undefined) {
      notify("The download command expects an http(s) URL.", vim.log.levels.ERROR);
      return;
    }
    if (vim.fn.executable(options().yt_dlp) !== 1) {
      notify("yt-dlp is required for downloads.", vim.log.levels.ERROR);
      return;
    }
    const directory = options().download_dir;
    vim.fn.mkdir(directory, "p");
    const args: string[] = [
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
      target,
    ];
    vim.system(args, { text: true }, (result: VimSystemResult): void => {
      vim.schedule((): void => {
        if (result.code === 0) {
          notify("Download complete: " + directory);
        } else {
          notify(result.stderr !== "" ? result.stderr : "The download failed.", vim.log.levels.ERROR);
        }
      });
    });
  };
  if (url !== undefined && url !== "") {
    run(url);
    return;
  }
  vim.ui.input({ prompt: "URL to download audio from: " }, (answer?: string): void => {
    if (answer !== undefined && answer !== "") {
      run(answer);
    }
  });
}

/** Configure the ten band equalizer. */
export function eq(argument?: string): void {
  const settings = options();
  if (argument === "off") {
    settings.eq.enabled = false;
    mpv.applyAudio();
    notify("The equalizer is disabled.");
    return;
  }
  if (argument === "on") {
    settings.eq.enabled = true;
    mpv.applyAudio();
    notify("The equalizer is enabled.");
    return;
  }
  const current: string[] = [];
  for (let index = 0; index < settings.eq.bands.length; index += 1) {
    current[current.length] = tostring(settings.eq.bands[index]);
  }
  vim.ui.input(
    {
      prompt: "10 EQ gains in dB, comma-separated (-12 to 12): ",
      default: table.concat(current, ","),
    },
    (answer?: string): void => {
      if (answer === undefined) {
        return;
      }
      const parts = split(answer, ",");
      const gains: number[] = [];
      for (let index = 0; index < parts.length; index += 1) {
        const value = tonumber(string.gsub(parts[index], "^%s*(.-)%s*$", "%1"));
        if (value === undefined || value < -12 || value > 12) {
          notify("Every EQ band must be between -12 and 12 dB.", vim.log.levels.ERROR);
          return;
        }
        gains[gains.length] = value;
      }
      if (gains.length !== 10) {
        notify("Enter exactly ten comma-separated gains.", vim.log.levels.ERROR);
        return;
      }
      settings.eq.bands = gains;
      settings.eq.enabled = true;
      mpv.applyAudio();
      notify("The custom 10 band equalizer is enabled.");
    },
  );
}

/** Configure the audio filter. */
export function filter(kind?: string): void {
  const settings = options();
  const apply = (type: string): void => {
    if (type === "off") {
      settings.filter.enabled = false;
      settings.filter.type = "off";
      mpv.applyAudio();
      notify("The filter is disabled.");
      return;
    }
    if (!isFilterType(type)) {
      notify("The filter must be lowpass, highpass, bandpass, or off.", vim.log.levels.ERROR);
      return;
    }
    settings.filter.type = type as PlayerOptions["filter"]["type"];
    vim.ui.input(
      {
        prompt: "Filter frequency (Hz): ",
        default: tostring(settings.filter.frequency),
      },
      (answer?: string): void => {
        if (answer === undefined) {
          return;
        }
        const frequency = tonumber(answer);
        if (frequency === undefined || frequency < 20 || frequency > 20000) {
          notify("The frequency must be between 20 and 20000 Hz.", vim.log.levels.ERROR);
          return;
        }
        settings.filter.frequency = math.floor(frequency + 0.5);
        settings.filter.enabled = true;
        if (type === "bandpass") {
          vim.ui.input(
            {
              prompt: "Band-pass Q width: ",
              default: tostring(settings.filter.width),
            },
            (width?: string): void => {
              if (width === undefined) {
                return;
              }
              const value = tonumber(width);
              settings.filter.width = value === undefined ? 1 : value;
              mpv.applyAudio();
              notify("The band-pass filter is enabled.");
            },
          );
          return;
        }
        mpv.applyAudio();
        notify("The " + type + " filter is enabled.");
      },
    );
  };
  if (kind !== undefined && kind !== "") {
    apply(kind);
    return;
  }
  const choices: string[] = ["off", "lowpass", "highpass", "bandpass"];
  vim.ui.select(choices, { prompt: "Audio filter" }, (choice: unknown): void => {
    if (typeof choice === "string") {
      apply(choice);
    }
  });
}

/** Show the lyrics of the current track, or of an ISRC. */
export function showLyrics(isrc?: string): void {
  lyrics.show(isrc);
}

/** Search the lyric catalogs. */
export function searchLyrics(query?: string): void {
  lyrics.search(query);
}

/** Search the JioSaavn catalog. */
export function searchJioSaavn(query?: string): void {
  lyrics.searchJioSaavn(query);
}

/** Translate the lyrics that are currently open. */
export function translateLyrics(target?: string): void {
  lyrics.translate(target);
}

/** Toggle the mpv spectrum window. */
export function visualize(enabled?: boolean): void {
  mpv.visualize(enabled);
}

/** Open the dashboard, or play a source. */
export function open(source?: string): void {
  if (source !== undefined && source !== "") {
    play(source);
    return;
  }
  ui.open();
}

/** Stop mpv and release every resource. */
export function shutdown(): void {
  mpv.shutdown();
  lyrics.close();
  ui.close();
}

/** The current queue state. */
export function queueInfo(): QueueInfo {
  const state = queue.state();
  return {
    count: state.items.length,
    current: state.current + 1,
    shuffle: state.shuffle,
    repeat: state.repeat,
  };
}

/**
 * Play a URL that was picked in a search result.
 *
 * Direct media files are handed to mpv as they are; a link to a web page is
 * resolved with yt-dlp first, so that the catalog results can be played too.
 */
export function playUrl(url: string): void {
  if (url === "") {
    return;
  }
  if (isDirectMedia(url)) {
    play(url);
    return;
  }
  resolveWithYtDlp(
    url,
    (resolved?: string, error?: string): void => {
      if (resolved === undefined) {
        notify("Could not play that result: " + tostring(error), vim.log.levels.ERROR);
        return;
      }
      play(resolved);
    },
  );
}

/** Label of a source, used by the queue browser. */
export function label(source: string): string {
  return sourceLabel(source);
}

const actionTogglePause: VoidAction = (): void => {
  pause();
};

const actionNext: VoidAction = (): void => {
  next();
};

const actionPrevious: VoidAction = (): void => {
  previous();
};

const actionShowLyrics: VoidAction = (): void => {
  showLyrics();
};

const actionSearchLyrics: VoidAction = (): void => {
  searchLyrics();
};

const actionSearchJioSaavn: VoidAction = (): void => {
  searchJioSaavn();
};

const actionVisualize: VoidAction = (): void => {
  visualize();
};

const actionFilter: VoidAction = (): void => {
  filter();
};

const actionEq: VoidAction = (): void => {
  eq();
};

const actionQueueList: VoidAction = (): void => {
  queueList();
};

const actionToggleShuffle: VoidAction = (): void => {
  toggleShuffle();
};

const actionCycleRepeat: VoidAction = (): void => {
  cycleRepeat();
};

const actionPickLocal: VoidAction = (): void => {
  pickLocal();
};

const actionVolumeDown: VoidAction = (): void => {
  volume(-5);
};

const actionVolumeUp: VoidAction = (): void => {
  volume(5);
};

const actionCloseLyrics: VoidAction = (): void => {
  lyrics.close();
};

const actionTranslateLyrics: VoidAction = (): void => {
  translateLyrics();
};

const actionToggleFollow: VoidAction = (): void => {
  const current = options();
  current.lyric.follow = !current.lyric.follow;
  notify("Karaoke follow " + (current.lyric.follow ? "on" : "off") + ".");
};

const actionPlayUrl: UrlAction = (url: string): void => {
  play(url);
};

function onEndFile(payload: unknown): void {
  if (type(payload) !== "table") {
    return;
  }
  const message = payload as Record<string, unknown>;
  const reason = message.reason;
  if (reason !== "eof") {
    if (reason === "error") {
      notify("mpv could not play the file.", vim.log.levels.ERROR);
    }
    return;
  }
  const state = queue.state();
  if (state.repeat === "track" && state.current >= 0) {
    playIndex(state.current, true);
    return;
  }
  const index = queue.nextIndex(state, (): number => {
    return math.random();
  });
  if (index === undefined) {
    notify("The queue finished.", vim.log.levels.INFO);
    return;
  }
  playIndex(index, false);
}

mpv.on("end-file", onEndFile);
mpv.on("file-load-failed", (payload: unknown): void => {
  const message = payload as Record<string, unknown>;
  const reason = typeof message.reason === "string" ? message.reason : "unknown error";
  notify("mpv could not load the file: " + reason, vim.log.levels.ERROR);
});

/** Configure the plugin. */
export function setup(overrides?: unknown): void {
  const settings = applyOptions(overrides);
  math.randomseed(vim.uv.hrtime() % 2147483647);
  const maps = settings.keymaps;
  vim.keymap.set(
    "n",
    maps.play_pause,
    (): void => {
      pause();
    },
    { desc: "Player: play/pause" },
  );
  vim.keymap.set(
    "n",
    maps.next,
    (): void => {
      next();
    },
    { desc: "Player: next" },
  );
  vim.keymap.set(
    "n",
    maps.previous,
    (): void => {
      previous();
    },
    { desc: "Player: previous" },
  );
  vim.keymap.set(
    "n",
    maps.lyrics,
    (): void => {
      showLyrics();
    },
    { desc: "Player: lyrics" },
  );
  setActions({
    toggle_pause: actionTogglePause,
    play_next: actionNext,
    play_previous: actionPrevious,
    show_lyrics: actionShowLyrics,
    search_lyrics: actionSearchLyrics,
    search_jiosaavn: actionSearchJioSaavn,
    toggle_visualizer: actionVisualize,
    configure_filter: actionFilter,
    configure_eq: actionEq,
    show_queue: actionQueueList,
    toggle_shuffle: actionToggleShuffle,
    cycle_repeat: actionCycleRepeat,
    pick_local: actionPickLocal,
    volume_down: actionVolumeDown,
    volume_up: actionVolumeUp,
    close_lyrics: actionCloseLyrics,
    translate_lyrics: actionTranslateLyrics,
    toggle_follow: actionToggleFollow,
    play_url: actionPlayUrl,
  });
  vim.api.nvim_create_autocmd("VimResized", {
    group: vim.api.nvim_create_augroup("player_nvim_resize", { clear: true }),
    callback: (): void => {
      ui.onResize();
    },
  });
}
