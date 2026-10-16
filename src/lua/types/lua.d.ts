/**
 * Ambient declarations for the subset of the Lua 5.1 standard library that the
 * player plugin uses.
 *
 * The plugin sources are compiled to Lua with `typescript-to-lua`. Everything
 * Lua provides at runtime therefore has to be declared here.
 *
 * Two rules apply to every declaration in this file:
 *
 * 1. Every interface and function is annotated with `@noSelf`. Without the
 *    annotation `typescript-to-lua` treats the functions as methods and emits
 *    `string:find(text, pattern)`, which passes the library table as the
 *    first argument and breaks at runtime.
 * 2. Only the first return value of a multi value function is modelled. Lua
 *    functions such as `string.find` return several values, and the
 *    `typescript-to-lua` tuple syntax would pull in its runtime bundle.
 */

/** Callback used by `string.gsub` when a pattern is replaced. */
/** @noSelf */
interface LuaStringCallback {
  /** @noSelf */
  (...args: string[]): string;
}

/** A function that takes no arguments. */
/** @noSelf */
interface LuaThunk {
  /** @noSelf */
  (): void;
}

/** Error handler passed to `xpcall`. */
/** @noSelf */
interface LuaErrorHandler {
  /** @noSelf */
  (message: unknown): boolean;
}

/** The Lua `string` library. */
/** @noSelf */
interface LuaStringLib {
  /** Position of the first match, or undefined. */
  find: (s: string, pattern: string, init?: number, plain?: boolean) => number | undefined;
  format: (fmt: string, ...args: unknown[]) => string;
  gsub: {
    /** @noSelf */
    (s: string, pattern: string, repl: string, n?: number): string;
    /** @noSelf */
    (s: string, pattern: string, repl: LuaStringCallback, n?: number): string;
  };
  len: (s: string) => number;
  lower: (s: string) => string;
  match: (s: string, pattern: string, init?: number) => string | undefined;
  rep: (s: string, n: number, sep?: string) => string;
  reverse: (s: string) => string;
  sub: (s: string, i: number, j?: number) => string;
  upper: (s: string) => string;
}

/** The Lua `table` library. */
/** @noSelf */
interface LuaTableLib {
  concat: (list: unknown, sep?: string, i?: number, j?: number) => string;
  insert: (list: unknown[], value: unknown) => void;
  remove: (list: unknown[], pos?: number) => unknown;
  sort: (list: unknown[], compare?: (a: unknown, b: unknown) => boolean) => void;
  unpack: (list: unknown[], i?: number, j?: number) => unknown[];
}

/** The Lua `math` library. */
/** @noSelf */
interface LuaMathLib {
  abs: (x: number) => number;
  ceil: (x: number) => number;
  floor: (x: number) => number;
  huge: number;
  max: (...values: number[]) => number;
  min: (...values: number[]) => number;
  random: (m?: number, n?: number) => number;
  randomseed: (seed: number) => void;
  sqrt: (x: number) => number;
}

/** The Lua `os` library. */
/** @noSelf */
interface LuaOsLib {
  time: (date?: Record<string, number>) => number;
  clock: () => number;
  date: (format?: string, time?: number) => string;
  getenv: (name: string) => string | undefined;
}

/** The Lua `io` library. */
/** @noSelf */
interface LuaIoLib {
  open: (path: string, mode?: string) => LuaFile;
  write: (path: string, content: string) => boolean;
}

/** An open Lua file handle. */
/** @noSelf */
interface LuaFile {
  read: (format?: string) => string | undefined;
  write: (content: string) => LuaFile;
  close: () => boolean;
}

/** Information about a Lua function, used to locate the plugin root. */
/** @noSelf */
interface LuaDebugInfo {
  source?: string;
  currentline?: number;
  linedefined?: number;
  short_src?: string;
}

declare const string: LuaStringLib;
declare const table: LuaTableLib;
declare const math: LuaMathLib;
declare const os: LuaOsLib;
declare const io: LuaIoLib;
declare const debug: { getinfo: (level: number, what: string) => LuaDebugInfo };

/** Load a Lua module. Used for the optional Telescope integration. */
/** @noSelf */
declare function require(name: string): unknown;

/** @noSelf */
declare function pcall(fn: LuaThunk): boolean;
/** @noSelf */
declare function xpcall(fn: LuaThunk, handler: LuaErrorHandler): boolean;
/** @noSelf */
declare function error(message: string, level?: number): never;
/** @noSelf */
declare function assert(value: unknown, message?: string): asserts value;
/** @noSelf */
declare function select(index: number, ...values: unknown[]): unknown;
/** @noSelf */
declare function setmetatable<T>(value: T, meta: Record<string, unknown>): T;
/** @noSelf */
declare function rawget<T>(value: Record<string, unknown>, key: string): T;
/** @noSelf */
declare function rawset<T>(value: Record<string, unknown>, key: string, item: T): Record<string, unknown>;
/** @noSelf */
declare function tostring(value: unknown): string;
/** @noSelf */
declare function tonumber(value: unknown, base?: number): number | undefined;
/** @noSelf */
declare function type(value: unknown): string;
/** @noSelf */
declare function print(...values: unknown[]): void;
/** @noSelf */
declare function unpack(list: unknown[], i?: number, j?: number): unknown[];
