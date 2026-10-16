/**
 * Shared type definitions for the player plugin.
 *
 * These describe the user facing configuration and the small value objects
 * that travel between the modules (queue state, lyric lines, ...).
 */

/** How the player behaves when the current track ends. */
export type RepeatMode = "off" | "queue" | "track";

/** Audio filter applied on top of the equalizer. */
export type FilterType = "off" | "lowpass" | "highpass" | "bandpass";

/** Where lyric translations are sent. */
/** @noSelf */
export interface TranslatorOptions {
  /** Base URL of a LibreTranslate compatible endpoint. */
  url: string;
  /** Optional API key for the translation endpoint. */
  api_key: string;
  /** Source language, `auto` lets the translator decide. */
  source: string;
}

/** Equalizer state. */
/** @noSelf */
export interface EqOptions {
  enabled: boolean;
  /** Gain per band in dB, exactly ten entries between -12 and 12. */
  bands: number[];
  /** Centre frequency per band in Hz, exactly ten entries. */
  frequencies: number[];
}

/** Filter state. */
/** @noSelf */
export interface FilterOptions {
  enabled: boolean;
  type: FilterType;
  /** Cut-off frequency in Hz. */
  frequency: number;
  /** Band-pass width (Q). */
  width: number;
}

/** Lyric viewer state. */
/** @noSelf */
export interface LyricOptions {
  /** Lyric source label shown in the viewer. */
  source: string;
  /** Follow the playing line automatically. */
  follow: boolean;
  /** Milliseconds between karaoke redraws. */
  interval: number;
}

/** Global key mappings installed by `setup()`. */
/** @noSelf */
export interface KeymapOptions {
  play_pause: string;
  next: string;
  previous: string;
  lyrics: string;
}

/** Every option understood by `require("player").setup()`. */
/** @noSelf */
export interface PlayerOptions {
  /** mpv executable. */
  mpv: string;
  /** yt-dlp executable. */
  yt_dlp: string;
  /** Node executable used for lyric search/translation. */
  node: string;
  /** Base URL of the unofficial JioSaavn catalog wrapper. */
  jiosaavn_api: string;
  /** Translation endpoint configuration. */
  translator: TranslatorOptions;
  /** Use Telescope.nvim for the local file picker when it is installed. */
  use_telescope: boolean;
  /** Directory used by `:PlayerDownload`. */
  download_dir: string;
  /** Initial mpv volume (0-100). */
  default_volume: number;
  /** Equalizer configuration. */
  eq: EqOptions;
  /** Filter configuration. */
  filter: FilterOptions;
  /** Extra arguments passed to the mpv command line. */
  mpv_args: string[];
  /** Lyric viewer configuration. */
  lyric: LyricOptions;
  /** Global key mappings. */
  keymaps: KeymapOptions;
}

/** A single queued track. */
/** @noSelf */
export interface QueueItem {
  /** Absolute path or URL handed to mpv. */
  source: string;
  /** Human readable label shown in the queue. */
  label: string;
}

/** Snapshot of the queue state. */
/** @noSelf */
export interface QueueInfo {
  /** Number of queued tracks. */
  count: number;
  /** Index of the playing track (0 when nothing is queued). */
  current: number;
  /** Shuffle is enabled. */
  shuffle: boolean;
  /** Current repeat mode. */
  repeat: RepeatMode;
}

/** A single word inside a karaoke line. */
/** @noSelf */
export interface LyricWord {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  finish: number;
  /** Word text. */
  text: string;
}

/** A single lyric line. */
/** @noSelf */
export interface LyricLine {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds, 0 when unknown. */
  finish: number;
  /** Line text. */
  text: string;
  /** Word level timings, when the source provides them. */
  words?: LyricWord[];
  /** Optional translation of the line. */
  translation?: string;
}

/** Metadata shown in the lyric viewer header. */
/** @noSelf */
export interface LyricMetadata {
  title: string;
  artist: string;
  album: string;
}
