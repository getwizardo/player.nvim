/**
 * Ambient declarations for the subset of the Neovim API used by player.nvim.
 *
 * The declarations are hand written on purpose: the plugin only relies on a
 * small, stable part of the API, and keeping the surface explicit makes it
 * obvious which Neovim versions the plugin supports (0.10+).
 *
 * Every interface carries the `@noSelf` annotation so that `typescript-to-lua`
 * emits plain function calls (`vim.api.nvim_buf_set_lines(...)`) instead of
 * method calls, which would pass the API table as an extra argument.
 */

/** Highlight definition accepted by `nvim_set_hl`. */
/** @noSelf */
interface VimHighlightSpec {
  fg?: string;
  bg?: string;
  sp?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  undercurl?: boolean;
  reverse?: boolean;
  standout?: boolean;
  strikethrough?: boolean;
  default?: boolean;
  ctermfg?: string | number;
  ctermbg?: string | number;
}

/** Result of an extmark. */
/** @noSelf */
interface VimExtmark {
  id: number;
}

/** Options accepted by `vim.keymap.set`. */
/** @noSelf */
interface VimKeymapOptions {
  buffer?: number;
  silent?: boolean;
  nowait?: boolean;
  desc?: string;
  expr?: boolean;
  replace_keycodes?: boolean;
  noremap?: boolean;
}

/** Options accepted by `nvim_create_user_command`. */
/** @noSelf */
interface VimUserCommandOptions {
  nargs?: string;
  complete?: string | VimCommandComplete;
  range?: boolean | string;
  count?: string | boolean;
  bang?: boolean;
  bar?: boolean;
  register?: boolean;
  desc?: string;
  force?: boolean;
}

/** Completion callback for a user command. */
/** @noSelf */
interface VimCommandComplete {
  /** @noSelf */
  (arglead: string, cmdline: string, cursorpos: number): string[];
}

/** Options accepted by `nvim_create_autocmd`. */
/** @noSelf */
interface VimAutocmdOptions {
  group?: number;
  pattern?: string | string[];
  buffer?: number;
  desc?: string;
  once?: boolean;
  nested?: boolean;
}

/** Configuration of a floating window. */
/** @noSelf */
interface VimFloatWindowConfig {
  relative: "editor" | "win" | "cursor";
  width?: number;
  height?: number;
  bufpos?: number[];
  row?: number;
  col?: number;
  anchor?: string;
  focusable?: boolean;
  external?: boolean;
  zindex?: number;
  style?: "minimal";
  border?: string | string[] | [string, string];
  title?: string;
  title_pos?: "center" | "left" | "right";
  noautocmd?: boolean;
}

/** Options accepted by `vim.ui.select`. */
/** @noSelf */
interface VimUiSelectOptions {
  prompt?: string;
  format_item?: VimFormatItem;
  kind?: string;
}

/** Formats a single entry of a `vim.ui.select` list. */
/** @noSelf */
interface VimFormatItem {
  /** @noSelf */
  (item: unknown): string;
}

/** Options accepted by `vim.ui.input`. */
/** @noSelf */
interface VimUiInputOptions {
  prompt?: string;
  default?: string;
  completion?: string;
  highlight?: boolean;
}

/** Called with the selected entry. */
/** @noSelf */
interface VimUiSelectChoice {
  /** @noSelf */
  (item: unknown, index: number): void;
}

/** Called with the text the user entered. */
/** @noSelf */
interface VimUiInputChoice {
  /** @noSelf */
  (value: string | undefined): void;
}

/** Result of a `vim.system` call. */
/** @noSelf */
interface VimSystemResult {
  code: number;
  signal?: number;
  stdout: string;
  stderr: string;
}

/** Options accepted by `vim.system`. */
/** @noSelf */
interface VimSystemOptions {
  text?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeout?: number;
  clear_env?: boolean;
}

/** Called when a `vim.system` call finishes. */
/** @noSelf */
interface VimSystemCallback {
  /** @noSelf */
  (result: VimSystemResult): void;
}

/** Options accepted by `vim.fn.jobstart`. */
/** @noSelf */
interface VimJobStartOptions {
  on_exit?: VimJobExitCallback;
  cwd?: string;
  env?: Record<string, string>;
  detach?: boolean;
}

/** Called when a job exits. */
/** @noSelf */
interface VimJobExitCallback {
  /** @noSelf */
  (jobId: number, exitCode: number, event: string): void;
}

/** Log levels used by `vim.notify`. */
/** @noSelf */
interface VimLogLevels {
  TRACE: number;
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
  OFF: number;
}

/** Global editor options. */
/** @noSelf */
interface VimOptions {
  columns: number;
  lines: number;
  cmdheight: number;
  splitright: boolean;
  splitbelow: boolean;
}

/** Window local options. */
/** @noSelf */
interface VimWindowOptions {
  winhighlight?: string;
  wrap?: boolean;
  cursorline?: boolean;
  number?: boolean;
  relativenumber?: boolean;
  signcolumn?: string;
  scrolloff?: number;
}

/** Buffer local options. */
/** @noSelf */
interface VimBufferOptions {
  modifiable?: boolean;
  buftype?: string;
  bufhidden?: string;
  swapfile?: boolean;
  filetype?: string;
  readonly?: boolean;
  buflisted?: boolean;
}

/**
 * A libuv timer.
 *
 * The methods of luv take the handle as their first argument, exactly like
 * the colon calls of Lua (`timer:start(...)`). They are declared as plain
 * function properties, so that the compiler keeps the handle in the call.
 */
/** @noSelf */
interface VimTimer {
  start: (timer: VimTimer, interval: number, repeat: number, callback: VimTimerCallback) => void;
  stop: (timer: VimTimer) => void;
  close: (timer: VimTimer) => void;
  is_active: (timer: VimTimer) => boolean;
}

/** Timer callback. */
/** @noSelf */
interface VimTimerCallback {
  /** @noSelf */
  (): void;
}

/**
 * A libuv stream.
 *
 * As with the timer, the handle is the first argument of every method, the
 * way the colon calls of Lua pass it.
 */
/** @noSelf */
interface VimUvStream {
  write: (stream: VimUvStream, data: string) => void;
  read_start: (stream: VimUvStream, callback: VimUvReadCallback) => void;
  read_stop: (stream: VimUvStream) => void;
  close: (stream: VimUvStream) => void;
  is_closing: (stream: VimUvStream) => boolean;
  connect: (stream: VimUvStream, path: string, callback: VimUvConnectCallback) => void;
}

/** Stream read callback. */
/** @noSelf */
interface VimUvReadCallback {
  /** @noSelf */
  (err: unknown, data?: string): void;
}

/** Stream connect callback. */
/** @noSelf */
interface VimUvConnectCallback {
  /** @noSelf */
  (err: unknown): void;
}

/** The `vim.uv` (or `vim.loop`) namespace. */
/** @noSelf */
interface VimUv {
  new_pipe: () => VimUvStream;
  new_timer: () => VimTimer;
  fs_unlink: (path: string) => void;
  hrtime: () => number;
  now: () => number;
}

/** Callback invoked for a user command. */
/** @noSelf */
interface VimUserCommandCallback {
  /** @noSelf */
  (opts: { args: string; fargs: string[]; bang: boolean; line1: number; line2: number }): void;
}

/** Callback invoked for an autocommand. */
/** @noSelf */
interface VimAutocmdCallback {
  /** @noSelf */
  (): void;
}

/** The `vim.api` namespace. */
/** @noSelf */
interface VimApi {
  nvim_create_user_command: (name: string, command: VimUserCommandCallback, opts?: VimUserCommandOptions) => void;
  nvim_create_autocmd: (event: string | string[], opts: VimAutocmdOptions & { callback: VimAutocmdCallback }) => number;
  nvim_create_augroup: (name: string, opts: { clear?: boolean }) => number;
  nvim_create_namespace: (name: string) => number;
  nvim_set_hl: (ns: number, name: string, opts: VimHighlightSpec) => void;
  nvim_create_buf: (listed: boolean, scratch: boolean) => number;
  nvim_buf_set_name: (buf: number, name: string) => void;
  nvim_buf_set_lines: (buf: number, start: number, end: number, strictIndexing: boolean, lines: string[]) => void;
  nvim_buf_get_lines: (buf: number, start: number, end: number, strictIndexing: boolean) => string[];
  nvim_buf_line_count: (buf: number) => number;
  nvim_buf_is_valid: (buf: number) => boolean;
  nvim_buf_clear_namespace: (buf: number, ns: number, lineStart: number, lineEnd: number) => void;
  nvim_buf_add_highlight: (buf: number, ns: number, group: string, line: number, colStart: number, colEnd: number) => void;
  nvim_buf_set_extmark: (buf: number, ns: number, line: number, col: number, opts: Record<string, unknown>) => VimExtmark;
  nvim_open_win: (buf: number, enter: boolean, config: VimFloatWindowConfig) => number;
  nvim_win_is_valid: (win: number) => boolean;
  nvim_win_close: (win: number, force: boolean) => void;
  nvim_win_set_config: (win: number, config: VimFloatWindowConfig) => void;
  nvim_win_set_cursor: (win: number, pos: [number, number]) => void;
  nvim_win_call: (win: number, fn: VimThunk) => void;
  nvim_get_current_win: () => number;
  nvim_get_current_buf: () => number;
  nvim_echo: (chunks: unknown[], history?: boolean) => void;
  nvim_err_writeln: (msg: string) => void;
}

/** A function that takes no arguments. */
/** @noSelf */
interface VimThunk {
  /** @noSelf */
  (): void;
}

/** The `vim.fn` namespace. */
/** @noSelf */
interface VimFn {
  expand: (path: string) => string;
  filereadable: (path: string) => number;
  fnamemodify: (path: string, mods: string) => string;
  executable: (cmd: string) => number;
  has: (feature: string) => number;
  mkdir: (path: string, flags: string) => number;
  isdirectory: (path: string) => number;
  getfsize: (path: string) => number;
  globpath: (path: string, pattern: string, nosuf?: boolean, list?: boolean) => string[];
  getcwd: () => string;
  stdpath: (what: string) => string;
  getpid: () => number;
  jobstart: (cmd: string[], opts?: VimJobStartOptions) => number;
  jobwait: (jobs: number[], timeout?: number) => number[];
  jobstop: (jobId: number) => number;
  nr2char: (code: number) => string;
  trim: (text: string) => string;
  environ: () => Record<string, string>;
  system: (cmd: string) => string;
  delete: (path: string) => number;
  input: (opts: VimUiInputOptions) => string;
}

/** The `vim.ui` namespace. */
/** @noSelf */
interface VimUi {
  select: (items: unknown[], opts: VimUiSelectOptions, onChoice: VimUiSelectChoice) => void;
  input: (opts: VimUiInputOptions, onConfirm: VimUiInputChoice) => void;
}

/** The `vim.json` namespace. */
/** @noSelf */
interface VimJson {
  encode: (value: unknown) => string;
  decode: (value: string) => unknown;
}

/** The `vim.health` namespace, used by `:checkhealth player`. */
/** @noSelf */
interface VimHealth {
  start: (name: string) => void;
  ok: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

/** The global `vim` object. */
/** @noSelf */
interface Vim {
  api: VimApi;
  fn: VimFn;
  ui: VimUi;
  json: VimJson;
  health: VimHealth;
  o: VimOptions;
  bo: Record<string | number, VimBufferOptions>;
  wo: Record<string | number, VimWindowOptions>;
  log: { levels: VimLogLevels };
  uv: VimUv;
  loop?: VimUv;
  env: Record<string, string>;
  g: Record<string, unknown>;
  b: Record<string, unknown>;
  w: Record<string, unknown>;
  cmd: (command: string) => void;
  notify: (message: string, level?: number, opts?: { title?: string }) => void;
  schedule: (fn: VimThunk) => void;
  defer_fn: (fn: VimThunk, timeout: number) => void;
  schedule_wrap: (fn: VimThunk) => VimThunk;
  keymap: { set: (mode: string | string[], lhs: string, rhs: string | VimThunk, opts?: VimKeymapOptions) => void };
  system: (cmd: string[], opts: VimSystemOptions, onResult?: VimSystemCallback) => { pid: number };
  split: (str: string, sep: string, opts?: { plain?: boolean; trimempty?: boolean }) => string[];
  trim: (str: string) => string;
  deepcopy: <T>(value: T) => T;
  inspect: (value: unknown) => string;
  starts_with: (value: string, prefix: string) => boolean;
  ends_with: (value: string, suffix: string) => boolean;
  tbl_isempty: (value: Record<string, unknown>) => boolean;
  empty: (value: unknown) => boolean;
  islist: (value: unknown) => boolean;
}

declare const vim: Vim;
