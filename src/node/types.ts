/**
 * The types of the lyrics helper.
 *
 * The helper is a small CLI that the Neovim plugin calls; these types
 * describe the documents it exchanges with the lyric services.
 */

/** A single word inside a karaoke line. */
export interface LyricWord {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  finish: number;
  /** Word text. */
  text: string;
}

/** A single lyric line. */
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

/** The services that are searched for lyrics. */
export type LyricProvider = "LRCLIB" | "MusicBrainz" | "iTunes" | "JioSaavn";

/** A search result of one of the lyric services. */
export interface LyricCandidate {
  /** The service the result comes from. */
  provider: LyricProvider;
  /** The identifier of the result inside the service. */
  id: string;
  /** Title of the track. */
  title: string;
  /** Artist of the track. */
  artist: string;
  /** Album of the track. */
  album: string;
  /** Duration in seconds. */
  duration?: number;
  /** The ISRC of the recording, when the service knows it. */
  isrc?: string;
  /** A playable URL, when the service provides one. */
  url?: string;
  /** The service has word level timings. */
  hasSyncedLyrics?: boolean;
  /** The service has lyrics at all. */
  hasLyrics?: boolean;
  /** The language of the track. */
  language?: string;
}

/** The answer of the `lyrics` command of the helper. */
export interface LyricsAnswer {
  /** The candidate the lyrics belong to. */
  candidate: LyricCandidate;
  /** The lyric lines. */
  lines: LyricLine[];
  /** A human readable label of the source. */
  source: string;
}

/** A record of the LRCLIB API. */
export interface LrclibRecord {
  id?: number | string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number | string;
  instrumental?: boolean;
  plainLyrics?: string;
  syncedLyrics?: string | null;
  isrc?: string;
}

/** One credit of a MusicBrainz recording. */
export interface MusicBrainzCredit {
  name?: string;
  artist?: { id?: string; name?: string };
}

/** One release of a MusicBrainz recording. */
export interface MusicBrainzRelease {
  title?: string;
  date?: string;
}

/** A recording of the MusicBrainz API. */
export interface MusicBrainzRecording {
  id?: string;
  title?: string;
  length?: number;
  disambiguation?: string;
  "artist-credit"?: MusicBrainzCredit[];
  releases?: MusicBrainzRelease[];
  isrcs?: string[];
}

/** The answer of the MusicBrainz search API. */
export interface MusicBrainzSearch {
  count?: number;
  offset?: number;
  recordings?: MusicBrainzRecording[];
}

/** A song of the iTunes search API. */
export interface ItunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
}

/** The answer of the iTunes search API. */
export interface ItunesSearch {
  resultCount?: number;
  results?: ItunesResult[];
}
