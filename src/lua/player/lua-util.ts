/**
 * Small helpers that hide the differences between TypeScript and Lua.
 *
 * The Lua standard library returns several values, uses one based indices and
 * has no `try/catch`; these helpers keep that noise out of the rest of the
 * plugin.
 */

/** The result of {@link attempt}. */
/** @noSelf */
export interface Attempt<T> {
  /** True when the call completed without an error. */
  ok: boolean;
  /** Return value of the call. */
  value?: T;
  /** Error message when the call failed. */
  error?: string;
}

/** A function that is called by {@link attempt}. */
/** @noSelf */
export interface AttemptFunction<T> {
  /** @noSelf */
  (): T;
}

/** Run a function and capture its result or its error message. */
export function attempt<T>(fn: AttemptFunction<T>): Attempt<T> {
  let value: T | undefined = undefined;
  let message: string | undefined = undefined;
  const ok = xpcall(
    (): void => {
      value = fn();
    },
    (error: unknown): boolean => {
      message = typeof error === "string" ? error : tostring(error);
      return false;
    },
  );
  if (ok === true) {
    return { ok: true, value: value };
  }
  return { ok: false, error: message };
}

/** Split a string on a plain (non pattern) separator. */
export function split(text: string, separator: string): string[] {
  const parts: string[] = [];
  if (separator === "") {
    parts[0] = text;
    return parts;
  }
  let from = 1;
  while (true) {
    const at = string.find(text, separator, from, true);
    if (at === undefined) {
      break;
    }
    parts[parts.length] = string.sub(text, from, at - 1);
    from = at + separator.length;
  }
  parts[parts.length] = string.sub(text, from);
  return parts;
}

/** Remove leading and trailing whitespace. */
export function trim(text: string): string {
  return string.gsub(text, "^%s*(.-)%s*$", "%1");
}

/**
 * Return the first capture of a Lua pattern.
 *
 * `string.match` returns several values, which cannot be modelled without the
 * TypeScript-to-Lua runtime, so the capture is collected with `string.gsub`
 * instead.
 */
export function matchCapture(text: string, pattern: string): string | undefined {
  let captured: string | undefined = undefined;
  string.gsub(text, pattern, (...args: string[]): string => {
    if (captured === undefined) {
      captured = args.length > 1 ? args[1] : args[0];
    }
    return "";
  });
  return captured;
}

/** True when `text` starts with `prefix`. */
export function startsWith(text: string, prefix: string): boolean {
  if (prefix === "") {
    return true;
  }
  return string.sub(text, 1, prefix.length) === prefix;
}

/** True when `text` ends with `suffix`. */
export function endsWith(text: string, suffix: string): boolean {
  if (suffix === "") {
    return true;
  }
  if (suffix.length > text.length) {
    return false;
  }
  return string.sub(text, text.length - suffix.length + 1) === suffix;
}

/** True when `needle` occurs inside `haystack`. */
export function contains(haystack: string, needle: string): boolean {
  if (needle === "") {
    return true;
  }
  return string.find(haystack, needle, 1, true) !== undefined;
}

/** Parse a number, returning undefined when the value is not numeric. */
export function toNumber(text: string): number | undefined {
  const value = tonumber(text);
  if (value === undefined) {
    return undefined;
  }
  return value;
}

/** Copy an array. */
export function copy<T>(list: T[]): T[] {
  const out: T[] = [];
  for (let index = 0; index < list.length; index += 1) {
    out[index] = list[index];
  }
  return out;
}

/** Append a value to an array. */
export function push<T>(list: T[], value: T): void {
  list[list.length] = value;
}

/** Remove the entry at `index` from an array. */
export function removeAt<T>(list: T[], index: number): void {
  table.remove(list, index + 1);
}

/** Remove every entry of an array. */
export function clear<T>(list: T[]): void {
  while (list.length > 0) {
    table.remove(list);
  }
}

/** Index of `value` inside `list`, or -1 when it is missing. */
export function indexOf<T>(list: T[], value: T): number {
  for (let index = 0; index < list.length; index += 1) {
    if (list[index] === value) {
      return index;
    }
  }
  return -1;
}

/** Concatenate the string representation of every entry. */
export function join(list: string[], separator: string): string {
  return table.concat(list, separator);
}
