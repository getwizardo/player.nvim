/**
 * Small helpers shared across the plugin.
 *
 * Everything here is written in TypeScript but compiles to idiomatic Lua: the
 * pattern helpers wrap Lua's `string` library so the rest of the plugin never
 * has to deal with Lua's multi-return values directly.
 */

/* ------------------------------------------------------------------ *
 * Lua pattern wrappers
 * ------------------------------------------------------------------ */

/**
 * `string.gsub` returning just the replaced text.
 *
 * Assigning a Lua multi-return to an array-typed value makes tstl emit
 * `local x = {f(...)}`, which keeps every return value; destructuring it
 * instead would emit `unpack(f(...))`, which only works on tables.
 */
export function replace(value: string, pattern: string, repl: string | ((...matches: string[]) => string)): string {
  const result = string.gsub(value, pattern, repl as (...matches: string[]) => string) as unknown as string[];
  return result[0];
}

/**
 * Captures of the first match, or an empty array when nothing matched.
 * A pattern without captures returns the whole match as its single element.
 */
export function match(value: string, pattern: string, init?: number): string[] {
  return string.match(value, pattern, init) as unknown as string[];
}

/** Every match of a single-capture (or capture-less) pattern, in order. */
export function matchList(value: string, pattern: string): string[] {
  const out: string[] = [];
  const iter = string.gmatch(value, pattern) as unknown as LuaIterable<string>;
  for (const found of iter) out.push(found);
  return out;
}

/** Every match of a two-capture pattern. */
export function matchPairs(value: string, pattern: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const iter = string.gmatch(value, pattern) as unknown as LuaIterable<LuaMultiReturn<[string, string]>>;
  for (const [first, second] of iter) out.push([first, second]);
  return out;
}

/** Every match of a three-capture pattern. */
export function matchTriples(value: string, pattern: string): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  const iter = string.gmatch(value, pattern) as unknown as LuaIterable<LuaMultiReturn<[string, string, string]>>;
  for (const [first, second, third] of iter) out.push([first, second, third]);
  return out;
}

/** 1-based index of a plain substring, or `undefined`. */
/** Byte index of the first *literal* occurrence of `needle` (1-based, no patterns). */
export function indexOf(value: string, needle: string, init = 1): number | undefined {
  const found = string.find(value, needle, init, true) as unknown as number[];
  return found[0];
}

/** 1-based index of a pattern match, or `undefined`. */
export function findPattern(value: string, pattern: string, init = 1): number | undefined {
  const found = string.find(value, pattern, init) as unknown as number[];
  return found[0];
}

/** Lua's 1-based, inclusive substring. */
export function sub(value: string, start: number, end?: number): string {
  return string.sub(value, start, end);
}

export function byteAt(value: string, position = 1): number {
  return string.byte(value, position);
}

export function lower(value: string): string {
  return string.lower(value);
}

export function upper(value: string): string {
  return string.upper(value);
}

export function rep(value: string, count: number): string {
  return string.rep(value, count);
}

export function trim(value: string): string {
  return replace(replace(value, "^%s+", ""), "%s+$", "");
}

/** Escape Lua pattern magic characters so `value` matches literally. */
export function escapePattern(value: string): string {
  return replace(value, "([%(%)%.%%%+%-%*%?%[%]%^%$])", "%%%1");
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

export function notify(message: string, level?: number): void {
  vim.schedule(() => vim.notify(message, level ?? vim.log.levels.INFO, { title: "player.nvim" }));
}

export function warn(message: string): void {
  notify(message, vim.log.levels.WARN);
}

export function fail(message: string): void {
  notify(message, vim.log.levels.ERROR);
}

/** Notify at most once per key per 15s so polled code cannot spam. */
const lastNotice: Record<string, number> = {};
export function notifyOnce(key: string, message: string, level?: number): void {
  const now = vim.uv.now();
  const previous = lastNotice[key];
  if (previous !== undefined && now - previous < 15000) return;
  lastNotice[key] = now;
  notify(message, level);
}

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

/** Clamp to the 0..1 range, which is what ratios want. */
export function clamp01(value: number): number {
  if (value !== value) return 0;
  return clamp(value, 0, 1);
}

/** Pad `value` on the right so columns line up. */
export function padRight(value: string, width: number): string {
  return value + rep(" ", math.max(0, width - value.length));
}

export function clamp(value: number, min: number, max: number): number {
  return math.min(max, math.max(min, value));
}

/** `m:ss` below an hour, `h:mm:ss` beyond it. */
export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || seconds < 0) return "--:--";
  const total = math.floor(seconds);
  const hours = math.floor(total / 3600);
  const minutes = math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return string.format("%d:%02d:%02d", hours, minutes, rest);
  return string.format("%d:%02d", minutes, rest);
}

/** `mm:ss` used for lyric timestamps. */
export function formatStamp(seconds: number): string {
  const minutes = math.floor(math.max(0, seconds) / 60);
  const rest = math.max(0, seconds) - minutes * 60;
  return string.format("%02d:%05.2f", minutes, rest);
}

export function splitLines(value: string): string[] {
  return matchList(value, "[^\r\n]+");
}

export function startsWith(value: string, prefix: string): boolean {
  return string.sub(value, 1, prefix.length) === prefix;
}

export function endsWith(value: string, suffix: string): boolean {
  if (suffix.length === 0) return true;
  return string.sub(value, -suffix.length) === suffix;
}

/* ------------------------------------------------------------------ *
 * URLs and text
 * ------------------------------------------------------------------ */

/** Percent-encode a query component; space becomes `+`. */
export function urlEncode(value: string): string {
  return replace(value, "[^%w%-%.~_]", (char: string) => {
    if (char === " ") return "+";
    return string.format("%%%02X", byteAt(char));
  });
}

/** Percent-encode a URL *path* segment: spaces become `%20`, not `+`. */
export function pathEncode(value: string): string {
  return replace(value, "([^%w%-%.~_])", (char: string) => string.format("%%%02X", byteAt(char)));
}

export type QueryValue = string | number | boolean | undefined;

/** Join a base URL with a path and drop undefined query values. */
export function buildUrl(base: string, path: string, query?: Record<string, QueryValue>): string {
  const root = replace(base, "/+$", "");
  const target = startsWith(path, "/") ? path : `/${path}`;
  let url = `${root}${target}`;
  if (query !== undefined) {
    const parts: string[] = [];
    // `for in` walks a Lua table with pairs(), which has no order: sort so the
    // same call always produces the same URL.
    const keys: string[] = [];
    for (const key in query) keys.push(key);
    keys.sort();
    for (const key of keys) {
      const value = query[key];
      if (value === undefined) continue;
      parts.push(`${urlEncode(key)}=${urlEncode(tostring(value))}`);
    }
    if (parts.length > 0) url = `${url}?${parts.join("&")}`;
  }
  return url;
}

function utf8char(codepoint: number): string {
  if (codepoint <= 0) return "";
  return vim.fn.nr2char(codepoint);
}

/** Decode the XML entities lyric providers put inside their text. */
export function decodeXmlEntities(value: string): string {
  const named = replace(
    replace(replace(replace(replace(value, "&lt;", "<"), "&gt;", ">"), "&quot;", '"'), "&apos;", "'"),
    "&nbsp;",
    " ",
  );
  const hex = replace(named, "&#x([%x]+);", (found: string) => utf8char(tonumber(found, 16) ?? 0));
  const decimal = replace(hex, "&#(%d+);", (found: string) => utf8char(tonumber(found, 10) ?? 0));
  return replace(decimal, "&amp;", "&");
}

/** Strip tags (adding a space) and collapse whitespace: HTML-ish content. */
export function plainText(value: string): string {
  return trim(replace(replace(replace(decodeXmlEntities(value), "<br%s*/?>", " "), "<[^>]+>", " "), "%s+", " "));
}

/**
 * Inline text of an XML fragment for TTML: tags are removed *without*
 * inserting a space (Apple/lrc.red files split one word across spans, e.g.
 * `<span>un</span><span>til</span>`), while whitespace text nodes between spans
 * survive as a single space.
 */
export function inlineText(value: string): string {
  const spaced = replace(value, "<br%s*/?>", " ");
  return trim(replace(decodeXmlEntities(replace(spaced, "<[^>]+>", "")), "%s+", " "));
}

/** Normalise a title/artist for comparison: lower-case, no punctuation. */
export function normalizeKey(value: string): string {
  return trim(lower(replace(replace(value, "[^%w%s]", " "), "%s+", " ")));
}

/** Word-overlap similarity in `0..1` used to rank fuzzy provider hits. */
export function similarity(a: string, b: string): number {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (left === "") return 0;
  if (left === right) return 1;
  if (indexOf(left, right) !== undefined || indexOf(right, left) !== undefined) return 0.9;
  let shared = 0;
  let total = 0;
  for (const word of matchList(left, "%S+")) {
    total += 1;
    if (indexOf(right, word) !== undefined) shared += 1;
  }
  if (total === 0) return 0;
  return shared / total;
}

/** Last path/URL segment with the query string removed. */
export function displayName(source: string): string {
  const label = vim.fn.fnamemodify(replace(source, "[?#].*$", ""), ":t");
  return label === "" ? source : label;
}

/* ------------------------------------------------------------------ *
 * Decoded JSON
 * ------------------------------------------------------------------ */

/** `vim.json.decode` maps JSON `null` to the `vim.NIL` sentinel, so every
 *  decoded field has to be type checked before it is used as a string. */
export function asText(value: unknown, fallback = ""): string {
  return type(value) === "string" ? (value as string) : fallback;
}

export function asNumber(value: unknown): number | undefined {
  return type(value) === "number" ? (value as number) : undefined;
}

export function asArray(value: unknown): unknown[] {
  return type(value) === "table" ? (value as unknown[]) : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return type(value) === "table" ? (value as Record<string, unknown>) : {};
}

/** Decode JSON without throwing; returns `undefined` when it is not JSON. */
export function decodeJson(text: string): unknown {
  if (trim(text) === "") return undefined;
  const result = pcall(() => vim.json.decode(text)) as unknown as [boolean, unknown];
  return result[0] ? result[1] : undefined;
}
