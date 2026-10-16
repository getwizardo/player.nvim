/** Shared data shapes for player.nvim. */

/** A single timed word inside a lyric line (TTML karaoke span). */
export interface LyricWord {
  start: number;
  finish: number;
  text: string;
  /** True for background-vocal spans (`role="x-bg"`). */
  background?: boolean;
}

/** One lyric line: either word timed (TTML) or line timed (LRC). */
export interface LyricLine {
  start: number;
  finish: number;
  text: string;
  words?: LyricWord[];
  translation?: string;
  /** Resolved `ttm:agent` name, e.g. "Vocal 1". */
  singer?: string;
  /** Song part from `lrc:songPart` / `itunes:songPart`, e.g. "Chorus". */
  part?: string;
  /** Concatenated background vocal text for the line. */
  background?: string;
}

/** Timing granularity of a resolved lyric set. */
export type SyncMode = "word" | "line" | "none";

/** A resolved, ready-to-render lyric document. */
export interface LyricSet {
  lines: LyricLine[];
  /** Human readable provenance, e.g. "lrc.red · TTML word sync". */
  source: string;
  provider: string;
  title: string;
  artist: string;
  album: string;
  isrc?: string;
  sync: SyncMode;
  songwriters: string[];
}

/** A searchable lyrics result before its text is fetched. */
export interface LyricCandidate {
  provider: string;
  id: string;
  title: string;
  artist: string;
  album: string;
  duration?: number;
  isrc?: string;
  url?: string;
  sync?: SyncMode;
  language?: string;
  score?: number;
  year?: number;
}

/** A playable track from a music search source. */
export interface TrackResult {
  provider: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  url: string;
}

/** Metadata of whatever mpv is currently playing. */
export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  duration: number;
  isrc: string;
}

/** What the dashboard shows as "now playing". */
export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  duration: number;
  provider: string;
  url: string;
  isrc?: string;
}

/** An mpv JSON IPC message (command, reply, or event). */
export interface MpvMessage {
  command?: unknown[];
  request_id?: number;
  error?: string;
  data?: unknown;
  event?: string;
  name?: string;
  id?: number;
  reason?: string;
  file_error?: string;
}
