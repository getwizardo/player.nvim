/**
 * Neovim API surface used by player.nvim.
 *
 * Every interface is annotated `@noSelf` so typescript-to-lua emits Lua calls
 * with dot syntax (`vim.api.nvim_buf_line_count(0)`) instead of method syntax
 * (`vim.api:nvim_buf_line_count(0)`), which is what the Neovim API expects.
 */

/** @noSelf */
interface NvimKeymapOptions {
  buffer?: boolean | number;
  desc?: string;
  silent?: boolean;
  nowait?: boolean;
  noremap?: boolean;
  expr?: boolean;
  replace_keycodes?: boolean;
}

/** @noSelf */
interface NvimUserCommandOptions {
  nargs?: number | string;
  desc?: string;
  complete?: string | ((arg: string, line: string, pos: number) => string[]);
  bang?: boolean;
}

/** @noSelf */
interface NvimCommandArgs {
  args: string;
  fargs: string[];
  name: string;
  range?: number[];
  count?: number;
  bang?: boolean;
}

/** @noSelf */
interface NvimAutocmdOptions {
  group?: number | string;
  pattern?: string | string[];
  desc?: string;
  once?: boolean;
  callback?: () => void;
}

/** @noSelf */
interface NvimFloatOptions {
  relative: string;
  width: number;
  height: number;
  row: number;
  col: number;
  style?: string;
  border?: string | string[];
  title?: string;
  title_pos?: string;
  focusable?: boolean;
  zindex?: number;
}

/** @noSelf */
interface NvimExtmarkOptions {
  end_row?: number;
  end_col?: number;
  hl_group?: string;
  line_hl_group?: string;
  priority?: number;
  id?: number;
  virt_text?: Array<[string, string]>;
  sign_text?: string;
}

/** @noSelf */
interface NvimHighlightDefinition {
  fg?: string;
  bg?: string;
  default?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  undercurl?: boolean;
  link?: string;
  ctermfg?: string;
  ctermbg?: string;
}

/** @noSelf */
interface NvimUiSelectOptions {
  prompt?: string;
  format_item?: (item: unknown) => string;
  kind?: string;
}

/** @noSelf */
interface NvimUiInputOptions {
  prompt?: string;
  default?: string;
  completion?: string;
}

/** @noSelf */
interface NvimSystemResult {
  code: number;
  signal: number;
  stdout?: string;
  stderr?: string;
}

/** @noSelf */
interface NvimSystemOptions {
  text?: boolean;
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string | string[];
  timeout?: number;
  detach?: boolean;
}

/** @noSelf */
interface NvimSystemObject {
  kill: (signal?: number | string) => void;
  write: (data?: string) => void;
  wait: (timeout?: number) => NvimSystemResult;
  pid: number;
}

/** @noSelf */
interface NvimJobOptions {
  on_exit?: (job: number, code: number, event: string) => void;
  on_stdout?: (job: number, data: string[], event: string) => void;
  on_stderr?: (job: number, data: string[], event: string) => void;
  cwd?: string;
  env?: Record<string, string>;
  detach?: boolean;
  pty?: boolean;
}

/** @noSelf */
interface UvTimer {
  start: (timeout: number, repeatMs: number, callback: () => void) => void;
  stop: () => void;
  close: () => void;
  is_closing: () => boolean;
  is_active: () => boolean;
}

/** @noSelf */
interface UvPipe {
  connect: (path: string, callback: (err?: string) => void) => void;
  read_start: (callback: (err: string | undefined, data: string | undefined) => void) => void;
  read_stop: () => void;
  write: (data: string, callback?: (err?: string) => void) => void;
  close: (callback?: () => void) => void;
  is_closing: () => boolean;
}

/** @noSelf */
interface UvStat {
  size: number;
  mode: number;
}

/** @noSelf */
interface NvimUv {
  new_timer: () => UvTimer;
  new_pipe: (ipc: boolean) => UvPipe;
  hrtime: () => number;
  now: () => number;
  fs_unlink: (path: string) => unknown;
  fs_stat: (path: string) => UvStat | undefined;
}

/** @noSelf */
interface NvimApi {
  nvim_buf_add_highlight: (buf: number, ns: number, group: string, line: number, col: number, endCol: number) => void;
  nvim_buf_clear_namespace: (buf: number, ns: number, startLine: number, endLine: number) => void;
  nvim_buf_get_lines: (buf: number, startLine: number, endLine: number, strict: boolean) => string[];
  nvim_buf_get_name: (buf: number) => string;
  nvim_buf_is_loaded: (buf: number) => boolean;
  nvim_buf_is_valid: (buf: number) => boolean;
  nvim_buf_line_count: (buf: number) => number;
  nvim_buf_set_extmark: (buf: number, ns: number, line: number, col: number, opts: NvimExtmarkOptions) => number;
  nvim_buf_set_lines: (buf: number, startLine: number, endLine: number, strict: boolean, lines: string[]) => void;
  nvim_buf_set_name: (buf: number, name: string) => void;
  nvim_create_augroup: (name: string, opts: { clear: boolean }) => number;
  nvim_create_autocmd: (event: string | string[], opts: NvimAutocmdOptions) => number;
  nvim_del_autocmd: (id: number) => void;
  nvim_create_buf: (listed: boolean, scratch: boolean) => number;
  nvim_create_namespace: (name: string) => number;
  nvim_create_user_command: (name: string, fn: (args: NvimCommandArgs) => void, opts?: NvimUserCommandOptions) => void;
  nvim_echo: (chunks: Array<[string, string?]>, history: boolean, opts?: Record<string, unknown>) => void;
  nvim_get_current_buf: () => number;
  nvim_get_current_win: () => number;
  nvim_open_win: (buf: number, enter: boolean, opts: NvimFloatOptions) => number;
  nvim_set_hl: (ns: number, name: string, def: NvimHighlightDefinition) => void;
  nvim_win_call: (win: number, fn: () => void) => void;
  nvim_win_close: (win: number, force: boolean) => void;
  nvim_win_get_buf: (win: number) => number;
  nvim_win_get_cursor: (win: number) => number[];
  nvim_win_get_height: (win: number) => number;
  nvim_win_get_width: (win: number) => number;
  nvim_win_is_valid: (win: number) => boolean;
  nvim_win_set_config: (win: number, opts: NvimFloatOptions) => void;
  nvim_win_set_cursor: (win: number, pos: number[]) => void;
}

/** @noSelf */
interface NvimBufferOptions {
  buftype: string;
  bufhidden: string;
  swapfile: boolean;
  filetype: string;
  modifiable: boolean;
  modified: boolean;
  buflisted: boolean;
}

/** @noSelf */
interface NvimWindowOptions {
  spell: boolean;
  winhl: string;
  wrap: boolean;
  cursorline: boolean;
  number: boolean;
  signcolumn: string;
  foldenable: boolean;
  scrolloff: number;
  conceallevel: number;
}

/** @noSelf */
interface NvimFn {
  executable: (name: string) => number;
  expand: (expr: string) => string;
  filereadable: (path: string) => number;
  fnamemodify: (path: string, mods: string) => string;
  getcwd: () => string;
  getpid: () => number;
  globpath: (path: string, expr: string, nosuf?: boolean, list?: boolean) => string[] | string;
  isdirectory: (path: string) => number;
  jobstart: (cmd: string[], opts: NvimJobOptions) => number;
  jobstop: (job: number) => void;
  jobwait: (jobs: number[], timeout?: number) => number[];
  mkdir: (path: string, mode?: string) => void;
  nr2char: (codepoint: number) => string;
  shellescape: (value: string) => string;
  stdpath: (what: string) => string;
  strftime: (format: string, time?: number) => string;
  trim: (value: string) => string;
}

/** @noSelf */
interface NvimJson {
  encode: (value: unknown) => string;
  decode: (value: string) => unknown;
}

/** @noSelf */
interface NvimLogLevelTable {
  TRACE: number;
  DEBUG: number;
  INFO: number;
  WARN: number;
  ERROR: number;
}

/** @noSelf */
interface NvimNotifyOptions {
  title?: string;
  icon?: string;
  timeout?: number;
}

/** @noSelf */
interface NvimGlobal {
  api: NvimApi;
  bo: { [buf: number]: NvimBufferOptions };
  cmd: (command: string) => void;
  deepcopy: <T>(value: T) => T;
  defer_fn: (fn: () => void, ms: number) => number;
  fn: NvimFn;
  g: Record<string, unknown>;
  inspect: (value: unknown) => string;
  json: NvimJson;
  keymap: {
    set: (mode: string | string[], lhs: string, rhs: unknown, opts?: NvimKeymapOptions) => void;
    del: (mode: string | string[], lhs: string, opts?: { buffer?: number }) => void;
  };
  list_extend: <T>(list: T[], extra: T[]) => T[];
  log: { levels: NvimLogLevelTable };
  loop: NvimUv;
  notify: (msg: string, level?: number, opts?: NvimNotifyOptions) => void;
  o: { columns: number; lines: number; timeoutlen: number };
  schedule: (fn: () => void) => void;
  schedule_wrap: (fn: (...args: unknown[]) => void) => () => void;
  split: (value: string, pattern?: string, opts?: { plain?: boolean; trimempty?: boolean }) => string[];
  system: (cmd: string[], opts?: NvimSystemOptions, cb?: (result: NvimSystemResult) => void) => NvimSystemObject;
  tbl_deep_extend: <T>(behavior: string, base: T, ...rest: unknown[]) => T;
  tbl_get: (table: unknown, ...keys: string[]) => unknown;
  ui: {
    input: (opts: NvimUiInputOptions, onConfirm: (value?: string) => void) => void;
    select: (list: unknown[], opts: NvimUiSelectOptions, onChoice: (item: unknown, index?: number) => void) => void;
  };
  uv: NvimUv;
  wo: { [win: number]: NvimWindowOptions };
}

declare const vim: NvimGlobal;
