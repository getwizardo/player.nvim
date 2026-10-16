import { options } from "./config";
import { attempt, trim } from "./lua-util";

/**
 * The mpv integration.
 *
 * mpv is started in idle mode and driven through its JSON IPC socket. The
 * module owns the socket, the request bookkeeping and the observers; the rest
 * of the plugin only uses the small API at the bottom of the file.
 */

/** A decoded IPC response. */
/** @noSelf */
export interface MpvResponse {
  /** `"success"` when mpv accepted the command. */
  error: string;
  /** The payload of the response. */
  data?: unknown;
}

/** Callback of an mpv command. */
/** @noSelf */
export interface CommandCallback {
  /** @noSelf */
  (data: unknown, response: MpvResponse): void;
}

/** Callback of a property observer. */
/** @noSelf */
export interface ValueCallback {
  /** @noSelf */
  (value: unknown): void;
}

/** Callback of a numeric property observer. */
/** @noSelf */
export interface NumberCallback {
  /** @noSelf */
  (value: number): void;
}

/** A command that is waiting for the IPC socket. */
interface PendingCommand {
  command: string[];
  callback?: CommandCallback;
}

/** A command that was sent to mpv and waits for its answer. */
interface PendingRequest {
  callback?: CommandCallback;
}

/** A property observer. */
interface ObservedProperty {
  id: number;
  name: string;
  callback: ValueCallback;
}

/** The state of the mpv process. */
interface MpvState {
  job: number;
  pipe: VimUvStream | undefined;
  socket: string;
  nextId: number;
  nextObserverId: number;
  pending: Record<string, PendingRequest>;
  waiting: PendingCommand[];
  observed: Record<string, ObservedProperty>;
  buffer: string;
  connected: boolean;
  connecting: boolean;
  failed: boolean;
  visualizer: boolean;
  stopping: boolean;
}

/** How often the plugin tries to reach the IPC socket before it gives up. */
const MAX_CONNECT_TRIES = 8;

const state: MpvState = {
  job: 0,
  pipe: undefined,
  socket: "",
  nextId: 0,
  nextObserverId: 0,
  pending: {},
  waiting: [],
  observed: {},
  buffer: "",
  connected: false,
  connecting: false,
  failed: false,
  visualizer: false,
  stopping: false,
};

const handlers: Record<string, ((payload: unknown) => void)[]> = {};

/** Build the argument list of an mpv command. */
export function cmd(...args: unknown[]): unknown[] {
  return args;
}

function emit(event: string, payload: unknown): void {
  const list = handlers[event];
  if (!list) {
    return;
  }
  for (let index = 0; index < list.length; index += 1) {
    list[index](payload);
  }
}

function notify(message: string, level?: number): void {
  const target = level === undefined ? vim.log.levels.INFO : level;
  vim.schedule((): void => {
    vim.notify(message, target, { title: "player.nvim" });
  });
}

function closePipe(): void {
  const pipe = state.pipe;
  if (pipe !== undefined) {
    attempt((): void => {
      pipe.read_stop(pipe);
    });
    if (!pipe.is_closing(pipe)) {
      pipe.close(pipe);
    }
  }
  state.pipe = undefined;
  state.connected = false;
  state.connecting = false;
  state.buffer = "";
}

function writeRaw(message: unknown): boolean {
  const pipe = state.pipe;
  if (state.connected && pipe !== undefined && !pipe.is_closing(pipe)) {
    pipe.write(pipe, vim.json.encode(message) + "\n");
    return true;
  }
  return false;
}

function handleResponse(message: Record<string, unknown>): void {
  const id = message.request_id;
  if (id === undefined || id === null) {
    return;
  }
  const key = tostring(id);
  const request = state.pending[key];
  if (request === undefined) {
    return;
  }
  state.pending[key] = undefined as unknown as PendingRequest;
  const response: MpvResponse = {
    error: typeof message.error === "string" ? message.error : "success",
    data: message.data,
  };
  if (request.callback !== undefined) {
    vim.schedule((): void => {
      const callback = request.callback;
      if (callback !== undefined) {
        callback(response.data, response);
      }
    });
  }
}

function handlePropertyChange(message: Record<string, unknown>): void {
  const id = message.id;
  if (id === undefined || id === null) {
    return;
  }
  const observer = state.observed[tostring(id)];
  if (observer === undefined) {
    return;
  }
  const value = message.data;
  vim.schedule((): void => {
    observer.callback(value);
  });
}

function handleLine(line: string): void {
  const decoded = attempt((): unknown => {
    return vim.json.decode(line);
  });
  if (!decoded.ok || type(decoded.value) !== "table") {
    return;
  }
  const message = decoded.value as Record<string, unknown>;
  if (message.request_id !== undefined && message.request_id !== null) {
    handleResponse(message);
    return;
  }
  const event = message.event;
  if (event === undefined) {
    return;
  }
  if (event === "property-change") {
    handlePropertyChange(message);
    return;
  }
  vim.schedule((): void => {
    emit(event as string, message);
  });
}

function connect(tries: number): void {
  if (state.socket === "" || state.connected || state.connecting) {
    return;
  }
  state.connecting = true;
  const pipe = vim.uv.new_pipe();
  state.pipe = pipe;
  pipe.connect(pipe, state.socket, (err: unknown): void => {
    if (err !== undefined && err !== null) {
      closePipe();
      if (tries < MAX_CONNECT_TRIES && !state.stopping) {
        const delay = tries * 100 > 1000 ? 1000 : tries * 100;
        vim.defer_fn((): void => {
          connect(tries + 1);
        }, delay);
        return;
      }
      state.failed = true;
      notify(
        "Could not reach the mpv IPC socket. The player will start mpv without remote control.",
        vim.log.levels.ERROR,
      );
      return;
    }
    state.connected = true;
    state.connecting = false;
    state.failed = false;
    state.buffer = "";
    pipe.read_start(pipe, (readErr: unknown, data?: string): void => {
      if (readErr !== undefined && readErr !== null) {
        closePipe();
        return;
      }
      state.buffer = state.buffer + tostring(data);
      while (true) {
        const newline = string.find(state.buffer, "\n", 1, true);
        if (newline === undefined) {
          break;
        }
        const line = string.sub(state.buffer, 1, newline - 1);
        state.buffer = string.sub(state.buffer, newline + 1);
        handleLine(line);
      }
    });
    const waiting = state.waiting;
    state.waiting = [];
    for (let index = 0; index < waiting.length; index += 1) {
      command(waiting[index].command, waiting[index].callback);
    }
  });
}

/** True while the mpv process is running. */
export function isAlive(): boolean {
  if (state.job === 0) {
    return false;
  }
  const result = vim.fn.jobwait([state.job], 0);
  return result.length > 0 && result[0] === -1;
}

/** Start mpv when it is not running yet. Returns false when that failed. */
export function ensure(): boolean {
  if (isAlive()) {
    return true;
  }
  const settings = options();
  if (vim.fn.executable(settings.mpv) !== 1) {
    notify("mpv is required. Install mpv and try again.", vim.log.levels.ERROR);
    return false;
  }
  const directory = vim.fn.stdpath("cache") + "/player.nvim";
  if (vim.fn.mkdir(directory, "p") !== 1 && vim.fn.isdirectory(directory) !== 1) {
    notify("Could not create the cache directory " + directory + ".", vim.log.levels.ERROR);
    return false;
  }
  state.socket = directory + "/mpv-" + tostring(vim.fn.getpid()) + ".sock";
  attempt((): void => {
    vim.uv.fs_unlink(state.socket);
  });
  const args: string[] = [
    settings.mpv,
    "--idle=yes",
    "--no-terminal",
    "--force-window=no",
    "--input-ipc-server=" + state.socket,
    "--volume=" + tostring(settings.default_volume),
  ];
  for (let index = 0; index < settings.mpv_args.length; index += 1) {
    args[args.length] = settings.mpv_args[index];
  }
  state.stopping = false;
  state.failed = false;
  state.job = vim.fn.jobstart(args, {
    on_exit: (): void => {
      closePipe();
      state.job = 0;
      if (state.socket !== "") {
        attempt((): void => {
          vim.uv.fs_unlink(state.socket);
        });
      }
      state.socket = "";
      state.waiting = [];
      state.observed = {};
      if (!state.stopping) {
        notify("mpv exited.");
      }
    },
  });
  if (state.job <= 0) {
    state.job = 0;
    notify("Could not start mpv.", vim.log.levels.ERROR);
    return false;
  }
  vim.defer_fn((): void => {
    connect(1);
  }, 50);
  return true;
}

/**
 * Send a command to mpv.
 *
 * The callback receives the decoded `data` field and the full response. When
 * mpv is not connected yet the command is queued and replayed as soon as the
 * IPC socket is up.
 */
export function command(args: unknown[], callback?: CommandCallback): void {
  if (!isAlive() && !ensure()) {
    return;
  }
  if (!state.connected) {
    const waiting: PendingCommand = { command: args as string[] };
    if (callback !== undefined) {
      waiting.callback = callback;
    }
    state.waiting[state.waiting.length] = waiting;
    return;
  }
  state.nextId += 1;
  const id = state.nextId;
  if (callback !== undefined) {
    const request: PendingRequest = { callback: callback };
    state.pending[tostring(id)] = request;
    vim.defer_fn((): void => {
      const pending = state.pending[tostring(id)];
      if (pending !== undefined) {
        state.pending[tostring(id)] = undefined as unknown as PendingRequest;
        notify("mpv did not answer the request in time.", vim.log.levels.WARN);
      }
    }, 15000);
  }
  writeRaw({ command: args, request_id: id });
}

/**
 * Rebuild the audio filter chain.
 *
 * The equalizer and the filter are combined into a single `lavfi` graph so
 * that mpv only has to instantiate a single filter chain.
 */
export function applyAudio(): void {
  const settings = options();
  const stages: string[] = [];
  if (settings.eq.enabled) {
    for (let index = 0; index < settings.eq.bands.length; index += 1) {
      let gain = settings.eq.bands[index];
      if (gain < -12) {
        gain = -12;
      }
      if (gain > 12) {
        gain = 12;
      }
      const frequency = settings.eq.frequencies[index];
      stages[stages.length] = string.format("equalizer=f=%d:t=q:w=1:g=%.1f", frequency, gain);
    }
  }
  if (settings.filter.enabled && settings.filter.type !== "off") {
    const kind = settings.filter.type;
    const hz = settings.filter.frequency;
    const width = settings.filter.width;
    if (kind === "lowpass" || kind === "highpass") {
      stages[stages.length] = string.format("%s=f=%d", kind, hz);
    } else if (kind === "bandpass") {
      stages[stages.length] = string.format("bandpass=f=%d:width_type=q:width=%.2f", hz, width);
    }
  }
  const filters: unknown[] = [];
  if (stages.length > 0) {
    filters[0] = { name: "lavfi", params: { graph: table.concat(stages, ",") } };
  }
  command(cmd("set_property", "af", filters));
}

/** Subscribe to an mpv event (`end-file`, `file-loaded`, ...). */
export function on(event: string, handler: (payload: unknown) => void): void {
  if (handlers[event] === undefined) {
    handlers[event] = [];
  }
  handlers[event][handlers[event].length] = handler;
}

/** Read a property from mpv. */
export function property(name: string, callback: ValueCallback): void {
  command(cmd("get_property", name), (data: unknown): void => {
    callback(data);
  });
}

/** Watch a property; the callback fires on every change. */
export function observe(name: string, callback: ValueCallback): number {
  if (!ensure()) {
    return 0;
  }
  state.nextObserverId += 1;
  const id = state.nextObserverId;
  const observer: ObservedProperty = { id: id, name: name, callback: callback };
  state.observed[tostring(id)] = observer;
  command(cmd("observe_property", id, name));
  return id;
}

/** Stop watching a property. */
export function unobserve(id: number): void {
  const key = tostring(id);
  if (state.observed[key] === undefined) {
    return;
  }
  state.observed[key] = undefined as unknown as ObservedProperty;
  command(cmd("unobserve_property", id));
}

/**
 * Play a file with a plain mpv process.
 *
 * This is the fallback for the rare setups where the IPC socket cannot be
 * reached: the music plays, but the plugin cannot control mpv.
 */
export function playDirect(source: string): void {
  const settings = options();
  const args: string[] = [settings.mpv, "--no-video", "--no-terminal"];
  for (let index = 0; index < settings.mpv_args.length; index += 1) {
    args[args.length] = settings.mpv_args[index];
  }
  args[args.length] = source;
  const job = vim.fn.jobstart(args, {
    on_exit: (): void => {
      notify("The fallback mpv process exited.");
    },
  });
  if (job <= 0) {
    notify("Could not start mpv.", vim.log.levels.ERROR);
    return;
  }
  notify("mpv was started without remote control: the IPC socket is not reachable.");
}

/** Load a file or URL and start playing it. */
export function play(source: string): void {
  if (!ensure()) {
    return;
  }
  if (state.failed) {
    playDirect(source);
    return;
  }
  command(cmd("loadfile", source, "replace"), (_data: unknown, response: MpvResponse): void => {
    if (response === undefined || response.error !== "success") {
      const reason = response === undefined ? "unknown error" : response.error;
      notify("mpv could not play " + source + ": " + reason, vim.log.levels.ERROR);
    }
  });
  applyAudio();
}

/** Toggle the pause state. */
export function pause(): void {
  command(cmd("cycle", "pause"));
}

/** Stop playback. */
export function stop(): void {
  command(cmd("stop"));
}

/** Seek to an absolute position in seconds. */
export function seek(seconds: number): void {
  command(cmd("seek", seconds, "absolute"));
}

/** Set the volume (0-100). */
export function setVolume(volume: number): void {
  command(cmd("set_property", "volume", volume));
}

/** Read the current volume. */
export function getVolume(callback: NumberCallback): void {
  property("volume", (value: unknown): void => {
    callback(typeof value === "number" ? value : 0);
  });
}

/** Toggle (or set) the live spectrum window. */
export function visualize(enabled?: boolean): void {
  const wanted = enabled === undefined ? !state.visualizer : enabled;
  if (!isAlive()) {
    notify("Start a track before opening the spectrum visualizer.", vim.log.levels.WARN);
    return;
  }
  const graph = "[aid1]asplit=2[ao][viz];[viz]showcqt=s=960x360:r=24[vo]";
  command(cmd("set_property", "options/lavfi-complex", wanted ? graph : ""), (_data: unknown, response: MpvResponse): void => {
    if (response === undefined || response.error !== "success") {
      notify("mpv could not create the spectrum. Check that its FFmpeg build includes showcqt.", vim.log.levels.ERROR);
      return;
    }
    state.visualizer = wanted;
    command(cmd("set_property", "options/force-window", wanted));
    notify(wanted ? "Audio spectrum window opened." : "Audio spectrum window closed.");
  });
}

/** True while the spectrum window is open. */
export function isVisualizing(): boolean {
  return state.visualizer;
}

/** Stop mpv and release every resource. */
export function shutdown(): void {
  state.stopping = true;
  if (state.job !== 0) {
    attempt((): void => {
      vim.fn.jobstop(state.job);
    });
  }
  closePipe();
  if (state.socket !== "") {
    attempt((): void => {
      vim.uv.fs_unlink(state.socket);
    });
  }
  state.job = 0;
  state.socket = "";
  state.waiting = [];
  state.pending = {};
  state.observed = {};
  state.visualizer = false;
  state.failed = false;
}

/** Describe the mpv process for `:checkhealth`. */
export function describe(): string {
  if (!isAlive()) {
    return "not running";
  }
  return "running (socket " + trim(state.socket) + ")";
}
