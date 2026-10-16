/** User configurable options for player.nvim. */

export interface EqOptions {
  enabled: boolean;
  /** Ten gains in dB, ascending frequency order. */
  bands: number[];
  frequencies: number[];
}

export type FilterType = "off" | "lowpass" | "highpass" | "bandpass";

export interface FilterOptions {
  enabled: boolean;
  type: FilterType;
  frequency: number;
  width: number;
}

export interface TranslatorOptions {
  url: string;
  api_key: string;
  source: string;
}

export interface LyricOptions {
  /** Keep the active lyric line centred in the karaoke float. */
  follow: boolean;
  /** Fetch lyrics automatically when a new track starts. */
  auto: boolean;
  /** Base URL of the lrc.red TTML catalogue. */
  lrc_red: string;
  /** Base URL of the LRCLIB API. */
  lrclib: string;
  /** Unofficial JioSaavn metadata wrapper; empty string disables it. */
  jiosaavn_api: string;
  /** Which lyric sources `:PlayerLyricsSearch` queries, in order. */
  sources: string[];
  /** Per-request timeout in seconds. */
  timeout: number;
}

export interface SearchOptions {
  /** Which music sources `:PlayerSearch` queries, in order. */
  sources: string[];
  /** Maximum results kept per source. */
  limit: number;
  /** yt-dlp search prefix: `ytsearch`, `scsearch`, `ytmsearch`, ... */
  youtube: string;
  /** Optional Invidious/Piped instance base URL; empty string disables it. */
  invidious: string;
  /** Audius API discovery endpoint. */
  audius: string;
  /** Internet Archive base URL. */
  archive: string;
  /** Per-request timeout in seconds. */
  timeout: number;
}

export interface Keymaps {
  play_pause: string;
  next: string;
  previous: string;
  lyrics: string;
}

export interface Options {
  mpv: string;
  yt_dlp: string;
  /** HTTP client used for lyrics/search requests (`curl`, falls back to `wget`). */
  http: string;
  mpv_args: string[];
  download_dir: string;
  default_volume: number;
  /** Seconds skipped by the seek controls. */
  seek_step: number;
  eq: EqOptions;
  filter: FilterOptions;
  translator: TranslatorOptions;
  lyric: LyricOptions;
  search: SearchOptions;
  keymaps: Keymaps;
}

function defaultOptions(): Options {
  return {
    mpv: "mpv",
    yt_dlp: "yt-dlp",
    http: "curl",
    mpv_args: [],
    download_dir: vim.fn.expand("~/Music"),
    default_volume: 75,
    seek_step: 5,
    eq: {
      enabled: false,
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      frequencies: [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    },
    filter: { enabled: false, type: "off", frequency: 1000, width: 1 },
    translator: { url: "http://127.0.0.1:5000", api_key: "", source: "auto" },
    lyric: {
      follow: true,
      auto: true,
      lrc_red: "https://lrc.red",
      lrclib: "https://lrclib.net",
      jiosaavn_api: "https://saavn.sumit.co",
      sources: ["lrc.red", "lrclib", "jiosaavn"],
      timeout: 20,
    },
    search: {
      sources: ["ytdlp", "archive", "audius"],
      limit: 12,
      youtube: "ytsearch",
      invidious: "",
      audius: "https://api.audius.co",
      archive: "https://archive.org",
      timeout: 20,
    },
    // <Leader> is resolved when the map is created; an empty string disables a map.
    keymaps: { play_pause: "<Leader>mp", next: "<Leader>mn", previous: "<Leader>mb", lyrics: "<Leader>ml" },
  };
}

let current: Options = defaultOptions();

/** The live option table; mutating nested fields is allowed. */
export function get(): Options {
  return current;
}

export function defaults(): Options {
  return defaultOptions();
}

export function setup(user?: unknown): Options {
  const merged = user === undefined ? defaultOptions() : vim.tbl_deep_extend("force", defaultOptions(), user);
  current = merged;
  return current;
}
