import { actions } from "./actions";
import { options } from "./config";
import { eqCurve, formatClock, progressBar, singleLine, truncate } from "./format";
import * as mpv from "./mpv";
import { queueInfo } from "./queue";

/**
 * The dashboard.
 *
 * A floating window that shows the current track, the progress, the equalizer
 * and the queue. It listens to the mpv properties instead of polling them, so
 * that the redraws stay cheap.
 */

/** The state of the dashboard. */
/** @noSelf */
export interface DashboardState {
  buffer: number;
  window: number;
  timer: VimTimer | undefined;
  frame: number;
  title: string;
  artist: string;
  position: number;
  duration: number;
  paused: boolean;
  volume: number;
  observers: number[];
}

const state: DashboardState = {
  buffer: 0,
  window: 0,
  timer: undefined,
  frame: 0,
  title: "No track selected",
  artist: "Choose a local track or search a service",
  position: 0,
  duration: 0,
  paused: false,
  volume: 0,
  observers: [],
};

const namespace = vim.api.nvim_create_namespace("player.nvim.dashboard");
const pulses: string[] = ["◉", "◎", "◍", "◉"];

function setStyle(): void {
  vim.api.nvim_set_hl(0, "PlayerSurface", { bg: "#17151d", fg: "#eeeaf2", default: true });
  vim.api.nvim_set_hl(0, "PlayerBorder", { fg: "#d85c86", bg: "#17151d", default: true });
  vim.api.nvim_set_hl(0, "PlayerEyebrow", { fg: "#e58ca5", bold: true, default: true });
  vim.api.nvim_set_hl(0, "PlayerTitle", { fg: "#fff7fb", bold: true, default: true });
  vim.api.nvim_set_hl(0, "PlayerMuted", { fg: "#aaa1b2", default: true });
  vim.api.nvim_set_hl(0, "PlayerAccent", { fg: "#ff739b", bold: true, default: true });
  vim.api.nvim_set_hl(0, "PlayerBar", { fg: "#b85e85", default: true });
  vim.api.nvim_set_hl(0, "PlayerOk", { fg: "#7fd1a6", default: true });
}

function stopTimer(): void {
  const timer = state.timer;
  if (timer !== undefined) {
    timer.stop(timer);
    timer.close(timer);
    state.timer = undefined;
  }
}

function stopObservers(): void {
  for (let index = 0; index < state.observers.length; index += 1) {
    mpv.unobserve(state.observers[index]);
  }
  state.observers = [];
}

function buildLines(): string[] {
  const settings = options();
  const queue = queueInfo();
  const pulse = pulses[state.frame % pulses.length];
  const title = truncate(singleLine(state.title), 46);
  const artist = truncate(singleLine(state.artist), 46);
  const position = formatClock(state.position);
  const duration = formatClock(state.duration);
  const bar = progressBar(state.position, state.duration, 34);
  const playback = state.paused ? "PAUSED" : "PLAYING";
  const repeat = queue.repeat;
  const shuffle = queue.shuffle ? "shuffle" : "ordered";
  return [
    "  PLAYER  ·  MUSIC FOR THE MOMENT",
    "",
    "                " + pulse + "  " + playback,
    "",
    "  NOW PLAYING",
    "  " + title,
    "  " + artist,
    "",
    "  " + bar,
    "  " + position + "                                                  " + duration,
    "",
    "  EQ CURVE",
    "  " + eqCurve(settings.eq.bands, settings.eq.enabled),
    "  VOLUME  " + tostring(math.floor(state.volume + 0.5)) + "%",
    "  QUEUE  " + tostring(queue.current + 1) + "/" + tostring(queue.count) + "  ·  " + shuffle + "  ·  repeat " + repeat,
    "",
    "  [p] play/pause    [n] next    [b] back    [Q] queue    [/] search",
    "  [j] JioSaavn      [v] spectrum    [f] filter    [e] equalizer",
    "  [r] local files   [s] shuffle    [R] repeat   [-][+] volume   [q] close",
  ];
}

function draw(): void {
  if (state.buffer === 0 || !vim.api.nvim_buf_is_valid(state.buffer)) {
    stopTimer();
    return;
  }
  const lines = buildLines();
  vim.bo[state.buffer].modifiable = true;
  vim.api.nvim_buf_set_lines(state.buffer, 0, -1, false, lines);
  vim.bo[state.buffer].modifiable = false;
  vim.api.nvim_buf_clear_namespace(state.buffer, namespace, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerEyebrow", 0, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerAccent", 2, 16, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerEyebrow", 4, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerTitle", 5, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 6, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerBar", 8, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 9, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerEyebrow", 11, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerAccent", 12, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 13, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 14, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 15, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 17, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 18, 0, -1);
  vim.api.nvim_buf_add_highlight(state.buffer, namespace, "PlayerMuted", 19, 0, -1);
}

const onProperty = (value: unknown): void => {
  if (typeof value === "string" && value !== "") {
    state.title = value;
    draw();
  }
};

const onArtist = (value: unknown): void => {
  if (typeof value === "string" && value !== "") {
    state.artist = value;
    draw();
  }
};

const onPosition = (value: unknown): void => {
  if (typeof value === "number") {
    state.position = value;
    draw();
  }
};

const onDuration = (value: unknown): void => {
  if (typeof value === "number") {
    state.duration = value;
    draw();
  }
};

const onPause = (value: unknown): void => {
  state.paused = value === true;
  draw();
};

const onVolume = (value: unknown): void => {
  if (typeof value === "number") {
    state.volume = value;
    draw();
  }
};

function watch(): void {
  stopObservers();
  state.observers[state.observers.length] = mpv.observe("media-title", onProperty);
  state.observers[state.observers.length] = mpv.observe("metadata/by-key/artist", onArtist);
  state.observers[state.observers.length] = mpv.observe("time-pos", onPosition);
  state.observers[state.observers.length] = mpv.observe("duration", onDuration);
  state.observers[state.observers.length] = mpv.observe("pause", onPause);
  state.observers[state.observers.length] = mpv.observe("volume", onVolume);
}

function resize(): void {
  if (state.window === 0 || !vim.api.nvim_win_is_valid(state.window)) {
    return;
  }
  const width = math.max(40, math.min(74, vim.o.columns - 8));
  const height = 21;
  vim.api.nvim_win_set_config(state.window, {
    relative: "editor",
    width: width,
    height: height,
    row: math.max(1, math.floor((vim.o.lines - height) / 2)),
    col: math.max(1, math.floor((vim.o.columns - width) / 2)),
    border: "rounded",
    title: "  player.nvim  ",
    title_pos: "center",
  });
}

/** Close the dashboard. */
export function close(): void {
  stopTimer();
  stopObservers();
  if (state.window !== 0 && vim.api.nvim_win_is_valid(state.window)) {
    vim.api.nvim_win_close(state.window, true);
  }
  state.window = 0;
  state.buffer = 0;
}

/** Open (or focus) the dashboard. */
export function open(): void {
  close();
  setStyle();
  const width = math.max(40, math.min(74, vim.o.columns - 8));
  const height = 21;
  state.buffer = vim.api.nvim_create_buf(false, true);
  vim.api.nvim_buf_set_name(state.buffer, "player://dashboard-" + tostring(vim.uv.hrtime()));
  vim.bo[state.buffer].buftype = "nofile";
  vim.bo[state.buffer].bufhidden = "wipe";
  vim.bo[state.buffer].swapfile = false;
  vim.bo[state.buffer].filetype = "playerdashboard";
  draw();
  state.window = vim.api.nvim_open_win(state.buffer, true, {
    relative: "editor",
    width: width,
    height: height,
    row: math.max(1, math.floor((vim.o.lines - height) / 2)),
    col: math.max(1, math.floor((vim.o.columns - width) / 2)),
    style: "minimal",
    border: "rounded",
    title: "  player.nvim  ",
    title_pos: "center",
  });
  vim.wo[state.window].winhighlight = "Normal:PlayerSurface,FloatBorder:PlayerBorder,FloatTitle:PlayerEyebrow";
  vim.wo[state.window].wrap = false;
  const buffer = state.buffer;
  const map = (key: string, action: VimThunk, description: string): void => {
    vim.keymap.set("n", key, action, { buffer: buffer, silent: true, desc: description });
  };
  const player = actions();
  map("q", (): void => {
    close();
  }, "Close player dashboard");
  map("<Esc>", (): void => {
    close();
  }, "Close player dashboard");
  map("p", player.toggle_pause, "Toggle playback");
  map("n", player.play_next, "Next track");
  map("b", player.play_previous, "Previous track");
  map("l", player.show_lyrics, "Open lyrics");
  map("/", player.search_lyrics, "Search lyrics");
  map("j", player.search_jiosaavn, "Search JioSaavn");
  map("v", player.toggle_visualizer, "Toggle spectrum window");
  map("f", player.configure_filter, "Configure filter");
  map("e", player.configure_eq, "Configure equalizer");
  map("Q", player.show_queue, "Browse player queue");
  map("s", player.toggle_shuffle, "Toggle queue shuffle");
  map("R", player.cycle_repeat, "Cycle repeat mode");
  map("r", (): void => {
    close();
    player.pick_local();
  }, "Pick local audio");
  map("-", player.volume_down, "Lower volume");
  map("+", player.volume_up, "Raise volume");
  state.timer = vim.uv.new_timer();
  state.timer.start(state.timer, 0, 400, (): void => {
    state.frame += 1;
    draw();
  });
  watch();
  mpv.getVolume((volume: number): void => {
    state.volume = volume;
    draw();
  });
}

/** Redraw the dashboard when the terminal was resized. */
export function onResize(): void {
  resize();
  draw();
}
