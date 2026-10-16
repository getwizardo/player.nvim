/**
 * mpv control over its JSON IPC socket.
 *
 * mpv is spawned with `--input-ipc-server=<socket>` and driven with newline
 * delimited JSON commands (see `DOCS/man/ipc.rst` upstream). The client is
 * deliberately defensive:
 *
 *  - commands issued before the socket is ready are queued, then flushed
 *  - the socket connect is retried for ~5s, then the user is told *why*
 *  - mpv's own stderr is captured so failures ("can't play") are visible
 *  - `idle-active` and `end-file` are observed, so a failed load is reported
 *    instead of silently sitting on the previous track
 */

import { get as getOptions } from "./config";
import type { MpvMessage } from "./types";
import { fail, indexOf, notify, notifyOnce, sub, trim, warn } from "./util";

type Callback = (data: unknown, message: MpvMessage) => void;
type Observer = (value: unknown) => void;

interface Pending {
  command: unknown[];
  id: number;
  callback?: Callback;
}

interface State {
  job?: number;
  pipe?: UvPipe;
  socket?: string;
  connected: boolean;
  connecting: boolean;
  requestId: number;
  observeId: number;
  pending: Record<number, Callback>;
  queued: Pending[];
  buffer: string;
  stderr: string[];
  observers: Record<string, Observer>;
  handlers: Array<(message: MpvMessage) => void>;
  visualizer: boolean;
}

const state: State = {
  connected: false,
  connecting: false,
  requestId: 0,
  observeId: 1000,
  pending: {},
  queued: [],
  buffer: "",
  stderr: [],
  observers: {},
  handlers: [],
  visualizer: false,
};

const QUEUE_LIMIT = 32;
const MAX_ATTEMPTS = 50;
const ATTEMPT_MS = 100;

function schedule(callback: () => void, delayMs: number): void {
  const timer = vim.uv.new_timer();
  timer.start(delayMs, 0, () => {
    timer.stop();
    if (!timer.is_closing()) timer.close();
    vim.schedule(callback);
  });
}

export function isAlive(): boolean {
  if (state.job === undefined) return false;
  const [status] = vim.fn.jobwait([state.job], 0);
  return status === -1;
}

export function isConnected(): boolean {
  return state.connected;
}

/** The last lines mpv wrote to stderr, used to explain failures. */
export function diagnostics(): string {
  if (state.stderr.length === 0) return "";
  return state.stderr.slice(-6).join("\n");
}

function closePipe(): void {
  state.connected = false;
  if (state.pipe !== undefined) {
    const pipe = state.pipe;
    state.pipe = undefined;
    pcall(() => pipe.read_stop());
    if (!pipe.is_closing()) pcall(() => pipe.close());
  }
}

function writeLine(message: unknown): boolean {
  if (!state.connected || state.pipe === undefined) return false;
  const result = pcall(() => state.pipe?.write(`${vim.json.encode(message)}\n`)) as unknown as [boolean];
  return result[0];
}

function drainPending(reason: string): void {
  const callbacks: Callback[] = [];
  for (const id in state.pending) {
    const callback = state.pending[tonumber(id) ?? 0];
    if (callback !== undefined) callbacks.push(callback);
  }
  state.pending = {};
  for (const callback of callbacks) vim.schedule(() => callback(undefined, { error: reason }));
}

function dispatchLine(line: string): void {
  if (trim(line) === "") return;
  const result = pcall(() => vim.json.decode(line)) as unknown as [boolean, unknown];
  const ok = result[0];
  const decoded = result[1];
  if (!ok || type(decoded) !== "table") return;
  const message = decoded as MpvMessage;
  const id = message.request_id;
  if (id !== undefined) {
    const callback = state.pending[id];
    if (callback !== undefined) {
      delete state.pending[id];
      vim.schedule(() => callback(message.data, message));
    }
  }
  if (message.event === "property-change" && message.name !== undefined) {
    const observer = state.observers[message.name];
    if (observer !== undefined) vim.schedule(() => observer(message.data));
  }
  if (message.event !== undefined) {
    for (const handler of state.handlers) {
      const current = handler;
      vim.schedule(() => current(message));
    }
  }
}

function onConnected(): void {
  state.connected = true;
  state.connecting = false;
  state.buffer = "";
  const pipe = state.pipe;
  if (pipe === undefined) return;
  pipe.read_start((error, data) => {
    if (error !== undefined || data === undefined) {
      closePipe();
      drainPending("connection lost");
      if (isAlive()) schedule(() => connect(1), ATTEMPT_MS);
      return;
    }
    state.buffer += data;
    while (true) {
      const boundary = indexOf(state.buffer, "\n");
      if (boundary === undefined) break;
      const line = sub(state.buffer, 1, boundary - 1);
      state.buffer = sub(state.buffer, boundary + 1);
      dispatchLine(line);
    }
  });
  for (const name in state.observers) send(["observe_property", state.observeId, name]);
  const queued = state.queued;
  state.queued = [];
  for (const item of queued) {
    if (item.callback !== undefined) state.pending[item.id] = item.callback;
    writeLine({ command: item.command, request_id: item.id });
  }
}

function connect(attempt: number): void {
  if (state.connected || state.connecting) return;
  if (state.socket === undefined || !isAlive()) {
    state.connecting = false;
    return;
  }
  state.connecting = true;
  const pipe = vim.uv.new_pipe(false);
  state.pipe = pipe;
  pipe.connect(state.socket, (error) => {
    if (error !== undefined) {
      closePipe();
      state.connecting = false;
      if (attempt >= MAX_ATTEMPTS) {
        const detail = diagnostics();
        fail(`Could not reach mpv's control socket.${detail === "" ? "" : `\n${detail}`}`);
        return;
      }
      schedule(() => connect(attempt + 1), ATTEMPT_MS);
      return;
    }
    onConnected();
  });
}

/** Keep the tail of mpv's own output so failures can be explained. */
function pushOutput(chunk: string): void {
  if (trim(chunk) === "") return;
  state.stderr.push(chunk);
  while (state.stderr.length > 40) state.stderr.splice(0, 1);
}

export function ensure(): boolean {
  if (isAlive()) return true;
  const options = getOptions();
  if (vim.fn.executable(options.mpv) !== 1) {
    fail(`${options.mpv} is not installed or not on PATH. Install mpv to play audio.`);
    return false;
  }
  closePipe();
  state.stderr = [];
  const cache = `${vim.fn.stdpath("cache")}/player.nvim`;
  vim.fn.mkdir(cache, "p");
  const socket = `${cache}/mpv-${vim.fn.getpid()}-${vim.uv.hrtime() % 1000000}.sock`;
  pcall(() => vim.uv.fs_unlink(socket));
  state.socket = socket;
  const args = [
    options.mpv,
    "--idle=yes",
    "--no-terminal",
    "--force-window=no",
    `--input-ipc-server=${socket}`,
    `--volume=${options.default_volume}`,
  ];
  for (const extra of options.mpv_args) args.push(extra);
  const job = vim.fn.jobstart(args, {
    on_stderr: (_job, data) => {
      for (const chunk of data) pushOutput(chunk);
    },
    on_stdout: (_job, data) => {
      for (const chunk of data) pushOutput(chunk);
    },
    on_exit: () => {
      closePipe();
      state.job = undefined;
      state.queued = [];
      drainPending("mpv exited");
      if (state.socket !== undefined) pcall(() => vim.uv.fs_unlink(state.socket as string));
      state.socket = undefined;
    },
  });
  if (job <= 0) {
    state.job = undefined;
    fail(`Could not start ${options.mpv} (jobstart returned ${job}).`);
    return false;
  }
  state.job = job;
  schedule(() => connect(1), ATTEMPT_MS);
  return true;
}

/** Send a command, queueing it when the socket is not up yet. */
export function send(command: unknown[], callback?: Callback): void {
  if (!isAlive() && !ensure()) return;
  state.requestId += 1;
  const id = state.requestId;
  if (state.connected) {
    if (callback !== undefined) state.pending[id] = callback;
    writeLine({ command, request_id: id });
    return;
  }
  if (state.queued.length >= QUEUE_LIMIT) {
    const dropped = state.queued.splice(0, state.queued.length - QUEUE_LIMIT + 1);
    for (const item of dropped) {
      if (item.callback !== undefined) item.callback(undefined, { error: "queue overflow" });
    }
  }
  state.queued.push({ command, id, callback });
}

/** Property read that is skipped entirely while mpv is not connected. */
export function poll<T>(name: string, callback: (value: T | undefined) => void): void {
  if (!state.connected) return;
  send(["get_property", name], (data, message) => callback(message.error === "success" ? (data as T) : undefined));
}

export function getProperty<T>(name: string, callback: (value: T | undefined) => void): void {
  send(["get_property", name], (data, message) => callback(message.error === "success" ? (data as T) : undefined));
}

export function setProperty(name: string, value: unknown): void {
  send(["set_property", name, value]);
}

/** Watch a property; mpv pushes `property-change` events. */
export function observe(name: string, callback: Observer): void {
  state.observers[name] = callback;
  if (state.connected) {
    state.observeId += 1;
    send(["observe_property", state.observeId, name]);
  }
}

export function onEvent(handler: (message: MpvMessage) => void): void {
  state.handlers.push(handler);
}

/** Load a source and report whether mpv accepted it. */
export function play(source: string, callback?: (error?: string) => void): void {
  if (!ensure()) {
    if (callback !== undefined) callback("mpv is unavailable.");
    return;
  }
  send(["loadfile", source, "replace"], (_data, message) => {
    if (message.error !== "success") {
      const detail = diagnostics();
      const reason = message.error === undefined ? "unknown error" : message.error;
      const text = `mpv refused to play ${source} (${reason}).${detail === "" ? "" : `\n${detail}`}`;
      fail(text);
      if (callback !== undefined) callback(text);
      return;
    }
    if (callback !== undefined) callback(undefined);
  });
}

export function pause(): void {
  send(["cycle", "pause"]);
}

export function setPaused(paused: boolean): void {
  setProperty("pause", paused);
}

export function stop(): void {
  send(["stop"]);
}

export function seek(seconds: number): void {
  send(["seek", seconds, "absolute"]);
}

export function nudge(seconds: number): void {
  send(["seek", seconds, "relative"]);
}

export function setVolume(volume: number): void {
  setProperty("volume", math.max(0, math.min(150, volume)));
}

export function isPlaying(callback: (playing: boolean) => void): void {
  getProperty<boolean>("pause", (paused) => callback(paused === false));
}

/** Rebuild the `af` filter chain from the EQ/filter configuration. */
export function applyAudio(): void {
  const options = getOptions();
  const filters: unknown[] = [];
  if (options.eq.enabled) {
    const stages: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const gain = math.max(-12, math.min(12, options.eq.bands[index] ?? 0));
      const frequency = options.eq.frequencies[index] ?? 125 * 2 ** (index - 2);
      stages.push(string.format("equalizer=f=%d:t=q:w=1:g=%.1f", frequency, gain));
    }
    filters.push({ name: "lavfi", params: { graph: stages.join(",") } });
  }
  if (options.filter.enabled && options.filter.type !== "off") {
    const hz = math.floor(math.max(20, math.min(20000, options.filter.frequency)));
    const width = math.max(0.1, math.min(10, options.filter.width));
    const kind = options.filter.type;
    const graph =
      kind === "bandpass"
        ? string.format("bandpass=f=%d:width_type=q:width=%.2f", hz, width)
        : string.format("%s=f=%d", kind, hz);
    filters.push({ name: "lavfi", params: { graph } });
  }
  // mpv rejects an empty node list, so clear the chain with an empty string.
  if (filters.length === 0) {
    setProperty("af", "");
    return;
  }
  send(["set_property", "af", filters], (_data, message) => {
    if (message.error !== "success") {
      notifyOnce("af", `Could not apply the audio chain (${message.error ?? "unknown"}). mpv needs FFmpeg filters for EQ.`, vim.log.levels.WARN);
    }
  });
}

export function isVisualizing(): boolean {
  return state.visualizer;
}

/** Toggle mpv's live `showcqt` spectrum in its own window. */
export function visualize(enabled?: boolean): void {
  const wanted = enabled ?? !state.visualizer;
  if (!isAlive()) {
    warn("Start a track before opening the spectrum visualizer.");
    return;
  }
  const graph = "[aid1]asplit=2[ao][viz];[viz]showcqt=s=960x360:r=24[vo]";
  send(["set_property", "options/lavfi-complex", wanted ? graph : ""], (_data, message) => {
    if (message.error !== "success") {
      fail("mpv could not create the spectrum. Check that its FFmpeg build includes showcqt.");
      return;
    }
    state.visualizer = wanted;
    setProperty("options/force-window", wanted);
    notify(wanted ? "Audio spectrum window opened." : "Audio spectrum window closed.");
  });
}

export function shutdown(): void {
  if (isAlive() && state.job !== undefined) {
    send(["quit"]);
    pcall(() => vim.fn.jobstop(state.job as number));
  }
  closePipe();
  if (state.socket !== undefined) pcall(() => vim.uv.fs_unlink(state.socket as string));
  state.job = undefined;
  state.socket = undefined;
  state.queued = [];
  state.pending = {};
  state.visualizer = false;
}
