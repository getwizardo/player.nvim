import { copy, indexOf } from "./lua-util";
import type { PlayerOptions } from "./types";

/**
 * The configuration of the plugin.
 *
 * The options are validated when they are merged: a typo can never break the
 * plugin, it is either clamped or ignored.
 */

/** True when the value is a Lua table. */
function isTable(value: unknown): value is Record<string, unknown> {
  return type(value) === "table";
}

/** True when the value is a string. */
function isString(value: unknown): value is string {
  return type(value) === "string";
}

/** True when the value is a number. */
function isNumber(value: unknown): value is number {
  return type(value) === "number";
}

/** True when the value is a boolean. */
function isBoolean(value: unknown): value is boolean {
  return type(value) === "boolean";
}

/** Keep the numeric entries of a table. */
function numberArray(value: unknown): number[] {
  if (!isTable(value)) {
    return [];
  }
  const out: number[] = [];
  const source = value as unknown as number[];
  for (let index = 0; index < source.length; index += 1) {
    if (isNumber(source[index])) {
      out[out.length] = source[index];
    }
  }
  return out;
}

/** Keep the string entries of a table. */
function stringArray(value: unknown): string[] {
  if (!isTable(value)) {
    return [];
  }
  const out: string[] = [];
  const source = value as unknown as string[];
  for (let index = 0; index < source.length; index += 1) {
    if (isString(source[index])) {
      out[out.length] = source[index];
    }
  }
  return out;
}

/** Default configuration. */
export function defaults(): PlayerOptions {
  return {
    mpv: "mpv",
    yt_dlp: "yt-dlp",
    node: "node",
    jiosaavn_api: "https://saavn.sumit.co",
    translator: {
      url: "http://127.0.0.1:5000",
      api_key: "",
      source: "auto",
    },
    use_telescope: true,
    download_dir: "~/Music",
    default_volume: 75,
    eq: {
      enabled: false,
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      frequencies: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    },
    filter: {
      enabled: false,
      type: "off",
      frequency: 1000,
      width: 1,
    },
    mpv_args: [],
    lyric: {
      source: "lrc.red",
      follow: true,
      interval: 120,
    },
    keymaps: {
      play_pause: "<Space>",
      next: "]n",
      previous: "[n",
      lyrics: "l",
    },
  };
}

const FILTER_TYPES: string[] = ["off", "lowpass", "highpass", "bandpass"];
const REPEAT_MODES: string[] = ["off", "queue", "track"];

function clamp(value: number, low: number, high: number): number {
  if (value < low) {
    return low;
  }
  if (value > high) {
    return high;
  }
  return value;
}

function trimSlash(url: string): string {
  if (url.length > 1 && string.sub(url, url.length, url.length) === "/") {
    return string.sub(url, 1, url.length - 1);
  }
  return url;
}

/** Deep copy of the plain data structures used by the configuration. */
export function clone(options: PlayerOptions): PlayerOptions {
  return {
    mpv: options.mpv,
    yt_dlp: options.yt_dlp,
    node: options.node,
    jiosaavn_api: options.jiosaavn_api,
    translator: {
      url: options.translator.url,
      api_key: options.translator.api_key,
      source: options.translator.source,
    },
    use_telescope: options.use_telescope,
    download_dir: options.download_dir,
    default_volume: options.default_volume,
    eq: {
      enabled: options.eq.enabled,
      bands: copy(options.eq.bands),
      frequencies: copy(options.eq.frequencies),
    },
    filter: {
      enabled: options.filter.enabled,
      type: options.filter.type,
      frequency: options.filter.frequency,
      width: options.filter.width,
    },
    mpv_args: copy(options.mpv_args),
    lyric: {
      source: options.lyric.source,
      follow: options.lyric.follow,
      interval: options.lyric.interval,
    },
    keymaps: {
      play_pause: options.keymaps.play_pause,
      next: options.keymaps.next,
      previous: options.keymaps.previous,
      lyrics: options.keymaps.lyrics,
    },
  };
}

/**
 * Merge user options into the defaults.
 *
 * Lists (`eq.bands`, `eq.frequencies`, `mpv_args`) are replaced wholesale
 * instead of being merged element by element, which is what a user expects
 * when they pass a shorter or longer list. Invalid values are clamped or
 * ignored so that a typo can never break the plugin.
 */
export function merge(base: PlayerOptions, overrides: unknown): PlayerOptions {
  const options = clone(base);
  if (!isTable(overrides)) {
    return options;
  }
  const given = overrides as Partial<PlayerOptions>;
  if (isString(given.mpv) && given.mpv !== "") {
    options.mpv = given.mpv;
  }
  if (isString(given.yt_dlp) && given.yt_dlp !== "") {
    options.yt_dlp = given.yt_dlp;
  }
  if (isString(given.node) && given.node !== "") {
    options.node = given.node;
  }
  if (isString(given.jiosaavn_api) && given.jiosaavn_api !== "") {
    options.jiosaavn_api = trimSlash(given.jiosaavn_api);
  }
  if (isTable(given.translator)) {
    const translator = given.translator as Partial<PlayerOptions["translator"]>;
    if (isString(translator.url) && translator.url !== "") {
      options.translator.url = trimSlash(translator.url);
    }
    if (isString(translator.api_key)) {
      options.translator.api_key = translator.api_key;
    }
    if (isString(translator.source) && translator.source !== "") {
      options.translator.source = translator.source;
    }
  }
  if (isBoolean(given.use_telescope)) {
    options.use_telescope = given.use_telescope;
  }
  if (isString(given.download_dir) && given.download_dir !== "") {
    options.download_dir = given.download_dir;
  }
  if (isNumber(given.default_volume)) {
    options.default_volume = clamp(Math.floor(given.default_volume + 0.5), 0, 100);
  }
  if (isTable(given.eq)) {
    const eq = given.eq as Partial<PlayerOptions["eq"]>;
    if (isBoolean(eq.enabled)) {
      options.eq.enabled = eq.enabled;
    }
    const bands = numberArray(eq.bands);
    if (bands.length === options.eq.bands.length) {
      for (let index = 0; index < bands.length; index += 1) {
        options.eq.bands[index] = clamp(bands[index], -12, 12);
      }
    }
    const frequencies = numberArray(eq.frequencies);
    if (frequencies.length === options.eq.frequencies.length) {
      for (let index = 0; index < frequencies.length; index += 1) {
        options.eq.frequencies[index] = clamp(Math.floor(frequencies[index] + 0.5), 20, 20000);
      }
    }
  }
  if (isTable(given.filter)) {
    const filter = given.filter as Partial<PlayerOptions["filter"]>;
    if (isBoolean(filter.enabled)) {
      options.filter.enabled = filter.enabled;
    }
    if (isString(filter.type) && indexOf(FILTER_TYPES, filter.type) >= 0) {
      options.filter.type = filter.type;
    }
    if (isNumber(filter.frequency)) {
      options.filter.frequency = clamp(Math.floor(filter.frequency + 0.5), 20, 20000);
    }
    if (isNumber(filter.width)) {
      options.filter.width = clamp(filter.width, 0.1, 10);
    }
  }
  if (isTable(given.mpv_args)) {
    options.mpv_args = stringArray(given.mpv_args);
  }
  if (isTable(given.lyric)) {
    const lyric = given.lyric as Partial<PlayerOptions["lyric"]>;
    if (isString(lyric.source) && lyric.source !== "") {
      options.lyric.source = lyric.source;
    }
    if (isBoolean(lyric.follow)) {
      options.lyric.follow = lyric.follow;
    }
    if (isNumber(lyric.interval)) {
      options.lyric.interval = clamp(Math.floor(lyric.interval + 0.5), 40, 1000);
    }
  }
  if (isTable(given.keymaps)) {
    const keymaps = given.keymaps as Partial<PlayerOptions["keymaps"]>;
    if (isString(keymaps.play_pause)) {
      options.keymaps.play_pause = keymaps.play_pause;
    }
    if (isString(keymaps.next)) {
      options.keymaps.next = keymaps.next;
    }
    if (isString(keymaps.previous)) {
      options.keymaps.previous = keymaps.previous;
    }
    if (isString(keymaps.lyrics)) {
      options.keymaps.lyrics = keymaps.lyrics;
    }
  }
  return options;
}

/** True when the value is one of the supported repeat modes. */
export function isRepeatMode(value: string): boolean {
  return indexOf(REPEAT_MODES, value) >= 0;
}

/** True when the value is one of the supported filter types. */
export function isFilterType(value: string): boolean {
  return indexOf(FILTER_TYPES, value) >= 0;
}

let current: PlayerOptions = defaults();

/** The options the plugin is running with. */
export function options(): PlayerOptions {
  return current;
}

/**
 * Apply the user options.
 *
 * Every call starts from the defaults again, so calling `setup()` twice never
 * leaves stale values behind.
 */
export function setup(overrides: unknown): PlayerOptions {
  current = merge(defaults(), overrides);
  current.download_dir = vim.fn.expand(current.download_dir);
  return current;
}
