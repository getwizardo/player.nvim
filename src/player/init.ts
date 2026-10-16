/**
 * Orchestration: search results become a queue, the queue drives mpv, and mpv
 * drives the dashboard and the karaoke float.
 *
 * Everything is callback based (no `async`/`await` in tstl), so each function
 * takes the work it needs to do next as its last argument.
 */

import { get as getOptions, setup as setupConfig, defaults } from "./config";
import * as highlights from "./highlights";
import * as http from "./http";
import * as karaoke from "./karaoke";
import * as lyrics from "./lyrics";
import * as mpv from "./mpv";
import * as search from "./search";
import * as ytdlp from "./sources/ytdlp";
import * as ui from "./ui";
import type { LyricCandidate, NowPlaying, TrackInfo, TrackResult } from "./types";
import { asNumber, asRecord, asText, fail, formatTime, lower, notify, trim, upper, warn } from "./util";

interface PlayerState {
  queue: TrackResult[];
  index: number;
  now?: NowPlaying;
  lastQuery: string;
  volume: number;
  progressTimer?: UvTimer;
  wired: boolean;
}

const state: PlayerState = { queue: [], index: -1, lastQuery: "", volume: 75, wired: false };
let configured = false;
let leaveHook = false;

/** True once `setup()` has run, so `plugin/` does not clobber a user's options. */
export function isConfigured(): boolean {
  return configured;
}

/** Probe the HTTP layer and the lyric services it talks to. */
export function doctor(): void {
  http.check((summary) => {
    const lines = [...summary];
    lines.push(`mpv: ${vim.fn.executable(getOptions().mpv) === 1 ? "found" : `NOT FOUND (${getOptions().mpv})`}`);
    lines.push(`yt-dlp: ${ytdlp.available() ? "found" : "not found (the ytdlp source needs it)"}`);
    notify(lines.join("\n"));
  });
}

/** mpv's own output, which is what to read when a track will not start. */
export function diagnostics(): void {
  const text = mpv.diagnostics();
  if (text === "") {
    notify(mpv.isAlive() ? "mpv is running and has not reported anything yet." : "mpv has not been started yet.");
    return;
  }
  notify(text, vim.log.levels.WARN);
}

/* ------------------------------------------------------------- plumbing */

function nowPlaying(track: TrackResult): NowPlaying {
  return {
    title: track.title,
    artist: track.artist,
    album: track.album ?? "",
    duration: track.duration ?? 0,
    provider: track.provider,
    url: track.url,
  };
}

function stopProgress(): void {
  if (state.progressTimer !== undefined) {
    state.progressTimer.stop();
    if (!state.progressTimer.is_closing()) state.progressTimer.close();
    state.progressTimer = undefined;
  }
}

function startProgress(): void {
  if (state.progressTimer !== undefined) return;
  const timer = vim.uv.new_timer();
  state.progressTimer = timer;
  timer.start(
    0,
    500,
    vim.schedule_wrap(() => {
      if (!mpv.isAlive()) {
        stopProgress();
        return;
      }
      mpv.poll<number>("time-pos", (position) => {
        if (position === undefined) return;
        mpv.poll<number>("duration", (duration) => {
          ui.setProgress(position, duration ?? state.now?.duration ?? 0);
        });
      });
    }),
  );
}

/** Read mpv metadata into the shape the lyric providers want. */
function currentTrackInfo(done: (info: TrackInfo) => void): void {
  mpv.getProperty<Record<string, unknown>>("metadata", (metadata) => {
    const meta = asRecord(metadata);
    mpv.getProperty<string>("media-title", (mediaTitle) => {
      mpv.getProperty<number>("duration", (duration) => {
        done({
          title: firstText(meta, ["title", "tit2"]) || trim(asText(mediaTitle)),
          artist: firstText(meta, ["artist", "tpe1", "album_artist", "icy-name"]),
          album: firstText(meta, ["album", "talb"]),
          duration: duration ?? state.now?.duration ?? 0,
          isrc: upper(firstText(meta, ["isrc", "tsrc"])),
        });
      });
    });
  });
}

/** Case-insensitive metadata lookup: mpv reports ICY tags in upper case. */
function firstText(meta: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = meta[name];
    if (value !== undefined) {
      const text = trim(asText(value));
      if (text !== "") return text;
    }
  }
  for (const key in meta) {
    const lowered = lower(key);
    for (const name of names) {
      if (lowered === name) {
        const text = trim(asText(meta[key]));
        if (text !== "") return text;
      }
    }
  }
  return "";
}

function autoLyrics(): void {
  if (!getOptions().lyric.auto) return;
  if (!karaoke.isOpen()) return;
  currentTrackInfo((info) => {
    if (info.title === "" && info.isrc === "") return;
    lyrics.resolveTrack(info, (set, error) => {
      if (set === undefined) {
        ui.setLyricStatus(error ?? "not found");
        return;
      }
      karaoke.open(set);
      ui.setLyricStatus(lyrics.describeSet(set));
    });
  });
}

/* --------------------------------------------------------------- wiring */

function wireMpv(): void {
  if (state.wired) return;
  state.wired = true;
  mpv.observe("pause", (value) => {
    const paused = value === true;
    ui.setPlaying(!paused);
  });
  mpv.observe("duration", (value) => {
    const duration = asNumber(value);
    if (duration !== undefined && duration > 0 && state.now !== undefined && state.now.duration === 0) {
      state.now.duration = duration;
      ui.setNow(state.now);
    }
  });
  mpv.observe("metadata", () => {
    if (!getOptions().lyric.auto) return;
    currentTrackInfo((info) => {
      if (state.now === undefined) return;
      state.now.isrc = info.isrc;
      if (info.title !== "") state.now.title = info.title;
      if (info.artist !== "") state.now.artist = info.artist;
      if (info.album !== "") state.now.album = info.album;
      ui.setNow(state.now);
    });
  });
  mpv.onEvent((message) => {
    if (message.event === "end-file") {
      ui.setBuffering(false);
      ui.setPlaying(false);
      if (message.reason === "eof") next();
      else if (message.reason === "error") {
        fail(`mpv could not play the track.${message.file_error === undefined ? "" : ` ${message.file_error}`}`);
      }
      return;
    }
    if (message.event === "file-loaded") {
      ui.setBuffering(false);
      ui.setPlaying(true);
      mpv.setVolume(state.volume);
      mpv.applyAudio();
      autoLyrics();
    }
  });
}

/* -------------------------------------------------------------- playback */

function playTrack(track: TrackResult): void {
  if (!mpv.ensure()) return;
  wireMpv();
  state.now = nowPlaying(track);
  ui.setNow(state.now);
  ui.setBuffering(true);
  ui.setLyricStatus("looking up…");
  startProgress();
  mpv.play(track.url, (error) => {
    if (error !== undefined) {
      ui.setBuffering(false);
      ui.setLyricStatus("unavailable");
      return;
    }
    mpv.setVolume(state.volume);
    mpv.applyAudio();
  });
}

function playAt(index: number): void {
  const track = state.queue[index];
  if (track === undefined) {
    warn("Nothing left in the queue.");
    return;
  }
  state.index = index;
  playTrack(track);
}

/**
 * Queue a track and start it.
 *
 * Internet Archive results are *items* (a directory URL mpv cannot play), so
 * every selection goes through `search.resolve`, which expands an item into its
 * playable audio files and passes anything else straight through.
 */
function playFromQueue(track: TrackResult): void {
  search.resolve(track, (tracks) => {
    const playable = tracks.length > 0 ? tracks : [track];
    if (playable.length > 1) {
      state.queue = playable;
      state.index = 0;
      ui.setTracks(playable);
    } else if (state.queue.length === 0) {
      state.queue = playable;
      state.index = 0;
    } else {
      const position = state.queue.indexOf(playable[0]);
      state.index = position >= 0 ? position : 0;
    }
    playTrack(playable[0]);
  });
}

export function playSelection(): void {
  const track = ui.selection();
  if (track === undefined) {
    warn("Select a result first (search with :Player <query>).");
    return;
  }
  playFromQueue(track);
}

export function playUrl(url: string): void {
  const target = trim(url);
  if (target === "") {
    warn("Give :PlayerUrl something to play.");
    return;
  }
  const track: TrackResult = {
    provider: "url",
    title: target,
    artist: "",
    album: "",
    url: target,
  };
  state.queue = [track];
  state.index = 0;
  playTrack(track);
}

export function next(): void {
  if (state.queue.length === 0) {
    warn("The queue is empty.");
    return;
  }
  playAt((state.index + 1) % state.queue.length);
}

export function previous(): void {
  if (state.queue.length === 0) {
    warn("The queue is empty.");
    return;
  }
  playAt((state.index - 1 + state.queue.length) % state.queue.length);
}

export function togglePlay(): void {
  if (!mpv.ensure()) return;
  mpv.isPlaying((playing) => mpv.setPaused(playing));
}

export function seekRelative(delta: number): void {
  if (!mpv.ensure()) return;
  mpv.nudge(delta);
}

export function nudgeVolume(delta: number): void {
  setVolume(state.volume + delta);
}

export function setVolume(level: number): void {
  state.volume = math.max(0, math.min(130, math.floor(level)));
  ui.setVolume(state.volume > 100 ? 100 : state.volume);
  if (mpv.isAlive()) mpv.setVolume(state.volume);
}

export function stop(): void {
  stopProgress();
  mpv.stop();
  ui.setPlaying(false);
  ui.setBuffering(false);
  ui.setLyricStatus("stopped");
}

export function close(): void {
  karaoke.close();
  ui.close();
}

export function toggleVisualizer(): void {
  if (!mpv.ensure()) return;
  const enabled = !mpv.isVisualizing();
  mpv.visualize(enabled);
  ui.setVisualizer(enabled);
}

/* ---------------------------------------------------------------- search */

export function searchTracks(query: string): void {
  const term = trim(query);
  if (term === "") {
    warn("Give :Player a search query.");
    return;
  }
  state.lastQuery = term;
  ui.open();
  ui.setQuery(term);
  ui.setTracks([]);
  ui.setLyricStatus("no lyrics loaded");
  search.run({ query: term }, (tracks, errors) => {
    ui.setTracks(tracks);
    state.queue = tracks;
    state.index = -1;
    if (tracks.length === 0) {
      const detail = errors.length > 0 ? `\n${errors[0]}` : "";
      fail(`No results for "${term}".${detail}`);
      return;
    }
    notify(`${tracks.length} result(s) for "${term}".`);
  });
}

export function reSearch(): void {
  if (state.lastQuery === "") {
    warn("Nothing to repeat yet.");
    return;
  }
  searchTracks(state.lastQuery);
}

/** Download the selected result with yt-dlp instead of streaming it. */
export function downloadSelection(): void {
  const track = ui.selection();
  if (track === undefined) {
    warn("Select a result to download first.");
    return;
  }
  ytdlp.download(track.url, (ok, message) => notify(message, ok ? vim.log.levels.INFO : vim.log.levels.ERROR));
}

export function status(): void {
  const parts: string[] = [];
  parts.push(state.now === undefined ? "Nothing playing." : `Playing ${state.now.title} — ${state.now.artist} (${state.now.provider})`);
  parts.push(`Queue: ${state.queue.length} track(s), position ${state.index + 1}.`);
  parts.push(`Volume: ${state.volume}%. Visualizer: ${mpv.isVisualizing() ? "on" : "off"}.`);
  parts.push(`Search sources: ${getOptions().search.sources.join(", ")}.`);
  parts.push(`Lyric sources: ${getOptions().lyric.sources.join(", ")}.`);
  const diagnostics = mpv.diagnostics();
  if (diagnostics !== "") parts.push(diagnostics);
  notify(parts.join("\n"));
}

/** Which sources are configured and reachable from here. */
export function sources(): void {
  const music: string[] = [];
  for (const source of search.SOURCES) music.push(source);
  const missing = ytdlp.available() ? "" : " (yt-dlp not on PATH — the ytdlp source will fail)";
  notify(`Music sources: ${music.join(", ")}${missing}\nEnabled: ${getOptions().search.sources.join(", ")}\nLyrics: ${getOptions().lyric.sources.join(", ")}`);
}

/* ---------------------------------------------------------------- lyrics */

function showCandidates(candidates: LyricCandidate[]): void {
  if (candidates.length === 0) {
    fail("No lyrics matched that query.");
    return;
  }
  const labels: string[] = [];
  for (const candidate of candidates) {
    const duration = candidate.duration !== undefined && candidate.duration > 0 ? ` ${formatTime(candidate.duration)}` : "";
    labels.push(`${candidate.title} — ${candidate.artist}${duration} [${candidate.provider}${candidate.sync === "word" ? " · word-sync" : ""}]`);
  }
  vim.ui.select(labels, { prompt: "Pick lyrics" }, (_choice, index) => {
    if (index === undefined) return;
    const candidate = candidates[index - 1];
    if (candidate === undefined) return;
    openCandidate(candidate);
  });
}

function openCandidate(candidate: LyricCandidate): void {
  ui.setLyricStatus("fetching…");
  lyrics.fetch(candidate, (set, error) => {
    if (set === undefined) {
      ui.setLyricStatus("unavailable");
      fail(`Could not load lyrics: ${error ?? "unknown error"}`);
      return;
    }
    karaoke.open(set);
    ui.setLyricStatus(lyrics.describeSet(set));
    notify(`Lyrics: ${lyrics.describeSet(set)}`);
  });
}

/** Lyrics for whatever is playing, falling back to a search. */
export function lyricsForCurrent(): void {
  currentTrackInfo((info) => {
    if (info.title === "") {
      warn("Nothing is playing, so there is nothing to look up. Use :PlayerLyricsSearch <query>.");
      return;
    }
    ui.setLyricStatus(`looking up "${info.title}"…`);
    lyrics.resolveTrack(info, (set) => {
      if (set === undefined) {
        ui.setLyricStatus("not found");
        lyrics.search(`${info.artist} ${info.title}`, (candidates) => showCandidates(candidates));
        return;
      }
      karaoke.open(set);
      ui.setLyricStatus(lyrics.describeSet(set));
    });
  });
}

export function lyricsSearch(query: string): void {
  const term = trim(query);
  if (term === "") {
    lyricsForCurrent();
    return;
  }
  ui.setLyricStatus(`searching "${term}"…`);
  lyrics.search(term, (candidates, errors) => {
    if (candidates.length === 0 && errors.length > 0) {
      fail(`Lyric search failed: ${errors[0]}`);
      return;
    }
    showCandidates(candidates);
  });
}

export function lyricsByIsrc(isrc: string): void {
  const code = upper(trim(isrc));
  if (code === "") {
    warn("Give :PlayerLyricsIsrc an ISRC code.");
    return;
  }
  ui.setLyricStatus(`ISRC ${code}…`);
  lyrics.fetchIsrc(code, (set, error) => {
    if (set === undefined) {
      ui.setLyricStatus("not found");
      fail(`No lrc.red lyrics for ISRC ${code}: ${error ?? "not found"}`);
      return;
    }
    karaoke.open(set);
    ui.setLyricStatus(lyrics.describeSet(set));
  });
}

export function translateLyrics(target?: string): void {
  karaoke.translateTo(target);
}

/* ------------------------------------------------------------------ setup */

/** Apply user options, define highlights and hook the dashboard together. */
export function setup(user?: unknown): void {
  configured = true;
  setupConfig(user);
  highlights.define();
  state.volume = getOptions().default_volume;
  ui.wire({
    playSelection,
    openLyrics: lyricsForCurrent,
    togglePlay,
    next,
    previous,
    seekRelative,
    nudgeVolume,
    toggleVisualizer,
    translate: () => translateLyrics(undefined),
    reSearch,
    stop,
    close,
  });
  ui.setVolume(state.volume > 100 ? 100 : state.volume);
  wireMpv();
  if (!leaveHook) {
    leaveHook = true;
    vim.api.nvim_create_autocmd("VimLeavePre", {
      callback: () => {
        stopProgress();
        mpv.shutdown();
        return false;
      },
    });
  }
}

export { defaults, search, mpv, ui, karaoke, lyrics, getOptions };
