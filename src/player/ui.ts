/**
 * The dashboard: search results on the left, now-playing on the right and a
 * transport bar across the bottom. Every buffer is scratch and unlisted, so
 * the plugin never touches the user's files or buffers.
 */

import * as highlights from "./highlights";
import { get as getOptions } from "./config";
import type { NowPlaying, TrackResult } from "./types";
import { clamp, clamp01, formatTime, indexOf, lower, notify, padRight, rep, sub, trim, upper } from "./util";

/** @noSelf */
export interface DashboardHandlers {
  playSelection: () => void;
  openLyrics: () => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seekRelative: (delta: number) => void;
  nudgeVolume: (delta: number) => void;
  toggleVisualizer: () => void;
  translate: () => void;
  reSearch: () => void;
  stop: () => void;
  close: () => void;
}

interface Windows {
  results?: number;
  now?: number;
  transport?: number;
}

interface State {
  tracks: TrackResult[];
  selection: number;
  now?: NowPlaying;
  /** Playback position of the current track, in seconds. */
  position: number;
  duration: number;
  volume: number;
  playing: boolean;
  buffering: boolean;
  lyrics: string;
  handlers?: DashboardHandlers;
  filter: string;
  /** What the current result set was searched for, shown in the header. */
  query: string;
  visualizer: boolean;
  windows: Windows;
  resizeAutocmd?: number;
}

const namespace = vim.api.nvim_create_namespace("player.nvim.dashboard");
const dash: State = {
  tracks: [],
  selection: 0,
  position: 0,
  duration: 0,
  volume: 80,
  playing: false,
  buffering: false,
  lyrics: "no lyrics loaded",
  filter: "",
  query: "",
  visualizer: false,
  windows: {},
};

/** Keys of the handlers that take no argument (the ones safe to fire blindly). */
type VoidHandler = { [K in keyof DashboardHandlers]: DashboardHandlers[K] extends () => void ? K : never }[keyof DashboardHandlers];

function call(handler: VoidHandler): void {
  const handlers = dash.handlers;
  if (handlers === undefined) return;
  handlers[handler]();
}

export function wire(handlers: DashboardHandlers): void {
  dash.handlers = handlers;
}

export function setQuery(query: string): void {
  dash.query = query;
}

export function setTracks(tracks: TrackResult[]): void {
  dash.tracks = tracks;
  dash.selection = 0;
  renderResults();
}

export function selection(): TrackResult | undefined {
  return dash.tracks[dash.selection];
}

export function trackCount(): number {
  return dash.tracks.length;
}

export function setNow(info: NowPlaying): void {
  dash.now = info;
  dash.position = 0;
  dash.duration = info.duration;
  renderNow();
  renderTransport();
}

export function setProgress(position: number, duration: number): void {
  dash.position = position;
  dash.duration = duration;
  renderTransport();
}

export function setPlaying(playing: boolean): void {
  dash.playing = playing;
  renderTransport();
}

export function setBuffering(buffering: boolean): void {
  dash.buffering = buffering;
  renderTransport();
}

export function setVolume(volume: number): void {
  dash.volume = clamp(volume, 0, 100);
  renderTransport();
}

export function setLyricStatus(text: string): void {
  dash.lyrics = text;
  renderNow();
}

export function setVisualizer(enabled: boolean): void {
  dash.visualizer = enabled;
  renderNow();
}

export function isOpen(): boolean {
  for (const key of Object.keys(dash.windows)) {
    const win = dash.windows[key as keyof Windows];
    if (win !== undefined && vim.api.nvim_win_is_valid(win)) return true;
  }
  return false;
}

function closeWindow(win: number | undefined): void {
  if (win !== undefined && vim.api.nvim_win_is_valid(win)) {
    pcall(() => vim.api.nvim_win_close(win as number, true));
  }
}

export function close(): void {
  closeWindow(dash.windows.results);
  closeWindow(dash.windows.now);
  closeWindow(dash.windows.transport);
  dash.windows = {};
}

function bufferFor(win: number | undefined, name: string): number {
  const existing = win === undefined ? undefined : vim.api.nvim_win_get_buf(win);
  if (existing !== undefined && vim.api.nvim_buf_is_valid(existing)) return existing;
  const buf = vim.api.nvim_create_buf(false, true);
  vim.api.nvim_buf_set_name(buf, name);
  vim.bo[buf].buftype = "nofile";
  vim.bo[buf].bufhidden = "wipe";
  vim.bo[buf].swapfile = false;
  return buf;
}

function writeLines(buf: number, lines: string[]): void {
  vim.bo[buf].modifiable = true;
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines);
  vim.bo[buf].modifiable = false;
}

function floatConfig(width: number, height: number, row: number, col: number): NvimFloatOptions {
  return { relative: "editor", width, height, row, col, style: "minimal", border: "rounded" };
}

function geometry(): { resultsWidth: number; nowWidth: number; height: number; rows: number; columns: number } {
  const columns = vim.o.columns;
  const rows = vim.o.lines;
  const resultsWidth = math.floor(clamp(columns * 0.58, 30, 96));
  return { resultsWidth, nowWidth: math.max(24, columns - resultsWidth - 8), height: clamp(rows - 8, 8, 40), rows, columns };
}

/* ---------------------------------------------------------------- results */

function providerGroups(): Array<{ provider: string; first: number; count: number }> {
  const groups: Array<{ provider: string; first: number; count: number }> = [];
  dash.tracks.forEach((track, index) => {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.provider === track.provider) {
      last.count += 1;
      return;
    }
    groups.push({ provider: track.provider, first: index, count: 1 });
  });
  return groups;
}

function renderResults(): void {
  const win = dash.windows.results;
  if (win === undefined || !vim.api.nvim_win_is_valid(win)) return;
  const buf = bufferFor(win, `player://results-${vim.uv.hrtime()}`);
  const groups = providerGroups();
  const lines: string[] = [];
  lines.push("  DISCOVER");
  const subject = dash.query === "" ? "" : ` for "${dash.query}"`;
  lines.push(`  ${dash.tracks.length} track(s)${subject}${dash.filter === "" ? "" : ` matching "${dash.filter}"`}`);
  lines.push(`  sources: ${getOptions().search.sources.join(", ")}`);
  lines.push("");
  const groupRows: number[] = [];
  const trackRows: number[] = [];
  if (dash.tracks.length === 0) {
    lines.push("  Nothing found yet.");
    lines.push("  Run :Player <query> to search,");
    lines.push("  :PlayerUrl <url> to play a link,");
    lines.push("  or press r to repeat the last search.");
  }
  let group = -1;
  dash.tracks.forEach((track, index) => {
    let current = -1;
    groups.forEach((item, position) => {
      if (index >= item.first && index < item.first + item.count) current = position;
    });
    if (current !== group) {
      group = current;
      groupRows.push(lines.length);
      lines.push(`  ${upper(groups[group]?.provider ?? "")}`);
    }
    const marker = index === dash.selection ? "▶" : " ";
    trackRows.push(lines.length);
    lines.push(`  ${marker} ${padRight(`${index + 1}.`, 4)}${track.title}`);
    lines.push(
      `    ${trim(track.artist)}${track.duration !== undefined && track.duration > 0 ? `  ·  ${formatTime(track.duration)}` : ""}`,
    );
  });
  lines.push("");
  lines.push("  <CR> play   <C-y> lyrics   <Tab> source   / filter   q close");
  writeLines(buf, lines);
  vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1);
  vim.api.nvim_buf_set_extmark(buf, namespace, 0, 0, { line_hl_group: "PlayerEyebrow", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 1, 0, { line_hl_group: "PlayerTitle", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 2, 0, { line_hl_group: "PlayerMuted", priority: 80 });
  for (const row of groupRows) {
    vim.api.nvim_buf_set_extmark(buf, namespace, row, 0, { line_hl_group: "PlayerSection", priority: 80 });
  }
  let cursorRow = -1;
  dash.tracks.forEach((_track, index) => {
    const row = trackRows[index];
    if (row === undefined) return;
    if (index === dash.selection) cursorRow = row;
  });
  vim.api.nvim_buf_set_extmark(buf, namespace, lines.length - 1, 0, { line_hl_group: "PlayerMuted", priority: 60 });
  if (cursorRow >= 0) pcall(() => vim.api.nvim_win_set_cursor(win as number, [cursorRow + 1, 0]));
}

/* ------------------------------------------------------------ now playing */

function progressBar(position: number, duration: number, width: number): string {
  if (duration <= 0) return `${rep("─", width)}  ${formatTime(position)}`;
  const filled = math.floor(clamp01(position / duration) * width);
  return `${rep("─", filled)}●${rep("─", width - filled - 1)}  ${formatTime(position)} / ${formatTime(duration)}`;
}

function renderNow(): void {
  const win = dash.windows.now;
  if (win === undefined || !vim.api.nvim_win_is_valid(win)) return;
  const buf = bufferFor(win, `player://now-${vim.uv.hrtime()}`);
  const now = dash.now;
  const state = dash.buffering ? "BUFFERING" : dash.playing ? "NOW PLAYING" : "PAUSED";
  const lines: string[] = [];
  lines.push("  QUEUE");
  lines.push(`  ${now === undefined ? "nothing playing" : now.title}`);
  lines.push(`  ${now === undefined ? "search for something to play" : now.artist}`);
  lines.push("");
  lines.push(`  ${state}`);
  lines.push(`  source   ${now === undefined ? "—" : now.provider}`);
  if (now !== undefined && now.album !== "") lines.push(`  album    ${now.album}`);
  lines.push(`  lyrics   ${dash.lyrics}`);
  lines.push(`  volume   ${dash.volume}%`);
  if (dash.visualizer) lines.push("  visual   on (press v to stop)");
  lines.push("");
  lines.push("  <Space> play/pause   [ ] prev/next");
  lines.push("  h l seek · - + volume · v visual");
  lines.push("  y lyrics · t translate · s stop · q close");
  writeLines(buf, lines);
  vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1);
  vim.api.nvim_buf_set_extmark(buf, namespace, 0, 0, { line_hl_group: "PlayerEyebrow", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 1, 0, { line_hl_group: "PlayerTitle", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 2, 0, { line_hl_group: "PlayerMuted", priority: 80 });
  vim.api.nvim_buf_set_extmark(buf, namespace, 4, 0, { line_hl_group: "PlayerAccent", priority: 80 });
  for (let row = 5; row < lines.length - 3; row++) {
    vim.api.nvim_buf_set_extmark(buf, namespace, row, 0, { line_hl_group: "PlayerMuted", priority: 60 });
  }
  for (let row = lines.length - 3; row < lines.length; row++) {
    vim.api.nvim_buf_set_extmark(buf, namespace, row, 0, { line_hl_group: "PlayerMuted", priority: 60 });
  }
}

/* -------------------------------------------------------------- transport */

function renderTransport(): void {
  const win = dash.windows.transport;
  if (win === undefined || !vim.api.nvim_win_is_valid(win)) return;
  const buf = bufferFor(win, `player://transport-${vim.uv.hrtime()}`);
  const width = vim.api.nvim_win_get_width(win);
  const bar = math.max(8, width - 42);
  const glyph = dash.buffering ? "◐" : dash.playing ? "❚❚" : "▶";
  const text = ` ⏮  ${glyph}  ⏭  ${progressBar(dash.position, dash.duration, bar)}  ${dash.volume}% `;
  writeLines(buf, [sub(text, 1, width)]);
  vim.api.nvim_buf_clear_namespace(buf, namespace, 0, -1);
  vim.api.nvim_buf_set_extmark(buf, namespace, 0, 0, { line_hl_group: "PlayerBar", priority: 80 });
}

/* ----------------------------------------------------------------- layout */

function layout(): void {
  const { resultsWidth, nowWidth, height, rows } = geometry();
  if (dash.windows.results !== undefined && vim.api.nvim_win_is_valid(dash.windows.results)) {
    vim.api.nvim_win_set_config(dash.windows.results, floatConfig(resultsWidth, height, 2, 2));
  }
  if (dash.windows.now !== undefined && vim.api.nvim_win_is_valid(dash.windows.now)) {
    vim.api.nvim_win_set_config(dash.windows.now, floatConfig(nowWidth, height, 2, resultsWidth + 4));
  }
  if (dash.windows.transport !== undefined && vim.api.nvim_win_is_valid(dash.windows.transport)) {
    vim.api.nvim_win_set_config(dash.windows.transport, floatConfig(math.max(28, resultsWidth + nowWidth + 2), 1, rows - 3, 2));
  }
}

function bindResults(buf: number): void {
  const map = (key: string, handler: () => void, description: string): void =>
    vim.keymap.set("n", key, handler, { buffer: buf, silent: true, desc: description });
  map("<CR>", () => call("playSelection"), "Play the selected track");
  map("o", () => call("playSelection"), "Play the selected track");
  map("<C-y>", () => call("openLyrics"), "Load lyrics for the selected track");
  map("<Tab>", () => {
    const after = providerGroups().filter((group) => group.first > dash.selection)[0];
    dash.selection = after === undefined ? 0 : after.first;
    renderResults();
  }, "Jump to the next source");
  map("<S-Tab>", () => {
    let target = 0;
    for (const group of providerGroups()) {
      if (group.first < dash.selection) target = group.first;
    }
    dash.selection = target;
    renderResults();
  }, "Jump to the previous source");
  map("j", () => {
    dash.selection = clamp(dash.selection + 1, 0, math.max(0, dash.tracks.length - 1));
    renderResults();
  }, "Next result");
  map("k", () => {
    dash.selection = clamp(dash.selection - 1, 0, math.max(0, dash.tracks.length - 1));
    renderResults();
  }, "Previous result");
  map("/", () => {
    vim.ui.input({ prompt: "Filter results: ", default: dash.filter }, (value) => {
      dash.filter = value === undefined ? "" : trim(value);
      if (dash.filter === "") {
        renderResults();
        return;
      }
      const needle = lower(dash.filter);
      const filtered: TrackResult[] = [];
      for (const track of dash.tracks) {
        if (indexOf(lower(`${track.title} ${track.artist} ${track.album ?? ""}`), needle) !== undefined) {
          filtered.push(track);
        }
      }
      if (filtered.length === 0) {
        notify("No result matched that filter.", vim.log.levels.WARN);
        return;
      }
      dash.tracks = filtered;
      dash.selection = 0;
      renderResults();
    });
  }, "Filter the visible results");
  map("r", () => call("reSearch"), "Repeat the last search");
  map("q", () => call("close"), "Close the dashboard");
  map("<Esc>", () => call("close"), "Close the dashboard");
  for (let index = 1; index <= 9; index++) {
    map(`${index}`, () => {
      dash.selection = index - 1;
      call("playSelection");
    }, `Play result ${index}`);
  }
}

function bindNow(buf: number): void {
  const map = (key: string, handler: () => void, description: string): void =>
    vim.keymap.set("n", key, handler, { buffer: buf, silent: true, desc: description });
  map("<Space>", () => call("togglePlay"), "Play / pause");
  map("]", () => call("next"), "Next track");
  map("[", () => call("previous"), "Previous track");
  map("l", () => {
    const handlers = dash.handlers;
    if (handlers !== undefined) handlers.seekRelative(seekStep());
  }, "Seek forward");
  map("h", () => {
    const handlers = dash.handlers;
    if (handlers !== undefined) handlers.seekRelative(-seekStep());
  }, "Seek back");
  map("=", () => {
    const handlers = dash.handlers;
    if (handlers !== undefined) handlers.nudgeVolume(5);
  }, "Volume up");
  map("+", () => {
    const handlers = dash.handlers;
    if (handlers !== undefined) handlers.nudgeVolume(5);
  }, "Volume up");
  map("-", () => {
    const handlers = dash.handlers;
    if (handlers !== undefined) handlers.nudgeVolume(-5);
  }, "Volume down");
  map("v", () => call("toggleVisualizer"), "Toggle the audio visualizer");
  map("y", () => call("openLyrics"), "Lyrics for the current track");
  map("t", () => call("translate"), "Translate the open lyrics");
  map("s", () => call("stop"), "Stop playback");
  map("q", () => call("close"), "Close the dashboard");
  map("<Esc>", () => call("close"), "Close the dashboard");
}

function seekStep(): number {
  return getOptions().seek_step;
}

/** Open (or refocus) the dashboard. */
export function open(): void {
  if (isOpen()) {
    layout();
    renderResults();
    renderNow();
    renderTransport();
    return;
  }
  highlights.define();
  const { resultsWidth, nowWidth, height, rows } = geometry();
  const results = vim.api.nvim_open_win(bufferFor(undefined, `player://results-${vim.uv.hrtime()}`), true, floatConfig(resultsWidth, height, 2, 2));
  const now = vim.api.nvim_open_win(bufferFor(undefined, `player://now-${vim.uv.hrtime()}`), false, floatConfig(nowWidth, height, 2, resultsWidth + 4));
  const transport = vim.api.nvim_open_win(bufferFor(undefined, `player://transport-${vim.uv.hrtime()}`), false, {
    relative: "editor",
    width: math.max(28, resultsWidth + nowWidth + 2),
    height: 1,
    row: rows - 3,
    col: 2,
    style: "minimal",
    border: "rounded",
    focusable: false,
  });
  dash.windows = { results, now, transport };
  for (const win of [results, now]) {
    vim.wo[win].winhl = highlights.floatHighlights();
    vim.wo[win].wrap = false;
    vim.wo[win].cursorline = false;
    vim.wo[win].number = false;
    vim.wo[win].signcolumn = "no";
    vim.wo[win].spell = false;
  }
  const resultsBuf = vim.api.nvim_win_get_buf(results);
  const nowBuf = vim.api.nvim_win_get_buf(now);
  vim.bo[resultsBuf].filetype = "playerresults";
  vim.bo[nowBuf].filetype = "playernow";
  vim.bo[vim.api.nvim_win_get_buf(transport)].filetype = "playertransport";
  bindResults(resultsBuf);
  bindNow(nowBuf);
  renderResults();
  renderNow();
  renderTransport();
  if (dash.resizeAutocmd !== undefined) pcall(() => vim.api.nvim_del_autocmd(dash.resizeAutocmd as number));
  dash.resizeAutocmd = vim.api.nvim_create_autocmd("VimResized", {
    callback: () => {
      if (isOpen()) layout();
      return false;
    },
  });
  notify(`Search sources: ${getOptions().search.sources.join(", ")}.`);
}
